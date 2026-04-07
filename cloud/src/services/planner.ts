import crypto from 'node:crypto';
import { config } from '../config';
import { ScrapeCommandDoc, ScrapePlanCommand, ScrapePlanRequest, ScrapePlanResponse, SourceConfigDoc } from '../contracts';
import { getDb, scrapeCommandsCollection, scrapeRunsCollection, sourceConfigsCollection } from '../firestore';
import { tryReserveDailyQuota } from './rollout-guards';

function toDate(value: string): Date | null {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + (minutes * 60 * 1000));
}

function isDue(source: SourceConfigDoc, now: Date): boolean {
  const leasedUntil = toDate(source.leased_until);
  if (leasedUntil && leasedUntil.getTime() > now.getTime()) {
    return false;
  }

  const minIntervalMs = Math.max(1, source.min_interval_min || 1) * 60 * 1000;
  const retryBackoffMs = Math.max(1, source.retry_backoff_min || 1) * 60 * 1000;
  const retryLimit = Math.max(1, source.retry_limit || 1);

  let earliestTs = 0;
  const lastStarted = toDate(source.last_started_at);
  if (lastStarted) {
    earliestTs = Math.max(earliestTs, lastStarted.getTime() + minIntervalMs);
  }

  const lastFailure = toDate(source.last_failure_at);
  if (lastFailure && source.consecutive_failures > 0) {
    const multiplier = Math.min(source.consecutive_failures, retryLimit);
    earliestTs = Math.max(earliestTs, lastFailure.getTime() + (retryBackoffMs * multiplier));
  }

  return now.getTime() >= earliestTs;
}

function getDayKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

async function hasReachedDailySuccessCap(sourceId: string, source: SourceConfigDoc, now: Date): Promise<boolean> {
  const cap = Number(source.daily_success_cap || 0);
  if (!cap || cap < 1) {
    return false;
  }
  const snapshot = await scrapeRunsCollection().where('source_id', '==', sourceId).get();
  const todayKey = getDayKey(now);
  let successCount = 0;
  for (let i = 0; i < snapshot.docs.length; i++) {
    const run = snapshot.docs[i].data() || {};
    if (run.success === true && getDayKey(String(run.finished_at || run.started_at || '')) === todayKey) {
      successCount += 1;
      if (successCount >= cap) {
        return true;
      }
    }
  }
  return false;
}

function normalizeSourceConfig(sourceId: string, input: Partial<SourceConfigDoc>): SourceConfigDoc {
  return {
    source_id: sourceId,
    name: String(input.name || sourceId).trim(),
    enabled: input.enabled !== false,
    scrape_page_urls: Array.isArray(input.scrape_page_urls) ? input.scrape_page_urls.filter(Boolean) : [],
    scrape_page_id: String(input.scrape_page_id || '').trim(),
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 100,
    min_interval_min: Number.isFinite(Number(input.min_interval_min)) ? Number(input.min_interval_min) : 60,
    retry_limit: Number.isFinite(Number(input.retry_limit)) ? Number(input.retry_limit) : 2,
    retry_backoff_min: Number.isFinite(Number(input.retry_backoff_min)) ? Number(input.retry_backoff_min) : 15,
    daily_success_cap: Number.isFinite(Number(input.daily_success_cap)) ? Number(input.daily_success_cap) : 0,
    max_tabs_per_site: Number.isFinite(Number(input.max_tabs_per_site)) ? Number(input.max_tabs_per_site) : 0,
    leased_until: String(input.leased_until || '').trim(),
    last_started_at: String(input.last_started_at || '').trim(),
    last_success_at: String(input.last_success_at || '').trim(),
    last_failure_at: String(input.last_failure_at || '').trim(),
    consecutive_failures: Number.isFinite(Number(input.consecutive_failures)) ? Number(input.consecutive_failures) : 0
  };
}

async function tryClaimSource(sourceId: string, addonInstanceId: string, now: Date): Promise<ScrapePlanCommand | null> {
  const ref = sourceConfigsCollection().doc(sourceId);
  const sourceSnapshot = await ref.get();
  if (!sourceSnapshot.exists) {
    return null;
  }
  const source = normalizeSourceConfig(sourceId, sourceSnapshot.data() as Partial<SourceConfigDoc>);
  if (!source.enabled || source.scrape_page_urls.length === 0 || !isDue(source, now)) {
    return null;
  }
  if (await hasReachedDailySuccessCap(sourceId, source, now)) {
    return null;
  }
  if (!(await tryReserveDailyQuota('scrape_leases', config.scrapePlanDailyCap, 1))) {
    return null;
  }

  return getDb().runTransaction(async function(transaction) {
    const leaseId = crypto.randomUUID();
    const leasedUntil = addMinutes(now, config.scrapeLeaseMinutes).toISOString();
    transaction.set(ref, {
      leased_until: leasedUntil,
      last_started_at: now.toISOString()
    }, { merge: true });
    const commandDoc: ScrapeCommandDoc = {
      lease_id: leaseId,
      source_id: source.source_id,
      addon_instance_id: addonInstanceId,
      status: 'leased',
      issued_at: now.toISOString(),
      leased_until: leasedUntil,
      completed_at: '',
      run_id: '',
      error_code: '',
      error_message: ''
    };
    transaction.set(scrapeCommandsCollection().doc(leaseId), commandDoc as unknown as Record<string, unknown>, { merge: true });

    return {
      lease_id: leaseId,
      source_id: source.source_id,
      scrape_page_url: source.scrape_page_urls[0],
      mode: 'list'
    };
  });
}

export async function claimScrapePlan(request: ScrapePlanRequest): Promise<ScrapePlanResponse> {
  const now = new Date();
  const maxCommands = Math.max(1, Math.min(Number(request.max_commands || 1), 10));
  const addonInstanceId = String(request.addon_instance_id || '').trim();
  const supported = new Set((request.supported_sources || []).map(function(item) {
    return String(item || '').trim();
  }).filter(Boolean));

  const snapshot = await sourceConfigsCollection().where('enabled', '==', true).get();
  const candidates = snapshot.docs
    .map(function(doc) {
      return normalizeSourceConfig(doc.id, doc.data() as Partial<SourceConfigDoc>);
    })
    .filter(function(source) {
      return source.scrape_page_urls.length > 0 && (supported.size === 0 || supported.has(source.source_id));
    })
    .sort(function(a, b) {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.source_id.localeCompare(b.source_id);
    });

  const commands: ScrapePlanCommand[] = [];
  for (let i = 0; i < candidates.length && commands.length < maxCommands; i++) {
    const command = await tryClaimSource(candidates[i].source_id, addonInstanceId, now);
    if (command) {
      commands.push(command);
    }
  }

  return {
    poll_after_sec: commands.length > 0 ? 30 : config.defaultPollSeconds,
    commands: commands
  };
}
