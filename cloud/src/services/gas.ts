import { config } from '../config';
import { SourceConfigDoc } from '../contracts';
import { sourceConfigsCollection } from '../firestore';

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function parseNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function postGasAction<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  if (!config.gasWebAppUrl) {
    throw new Error('GAS_WEBAPP_URL is not configured');
  }

  const response = await fetch(config.gasWebAppUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(Object.assign({ action: action }, payload || {}))
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error('GAS action failed: ' + response.status + ' ' + text.substring(0, 200));
  }
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('Invalid JSON from GAS');
  }
  if (!parsed || parsed.success !== true) {
    throw new Error(parsed && parsed.error ? String(parsed.error) : 'GAS action returned error');
  }
  return parsed as T;
}

function mapGasSourceRow(row: Record<string, unknown>): SourceConfigDoc {
  const sourceId = normalizeString(row.id || row.source_id || row.name);
  const scrapeUrls: string[] = [];
  const directUrl = normalizeString(row.scrapePageUrl || row.scrape_page_url);
  if (directUrl) {
    scrapeUrls.push(directUrl);
  }
  return {
    source_id: sourceId,
    name: normalizeString(row.name || sourceId),
    enabled: row.enabled !== false,
    scrape_page_urls: scrapeUrls,
    scrape_page_id: normalizeString(row.id || row.source_id || sourceId),
    priority: parseNumber(row.priority, 100),
    min_interval_min: parseNumber(row.minIntervalMin || row.min_interval_min, 60),
    retry_limit: parseNumber(row.retryLimit || row.retry_limit, 2),
    retry_backoff_min: parseNumber(row.retryBackoffMin || row.retry_backoff_min, 15),
    daily_success_cap: parseNumber(row.dailySuccessCap || row.daily_success_cap, 0),
    max_tabs_per_site: parseNumber(row.maxTabsPerSite || row.max_tabs_per_site, 0),
    leased_until: '',
    last_started_at: '',
    last_success_at: '',
    last_failure_at: '',
    consecutive_failures: 0
  };
}

export async function syncSourceConfigsFromGas(): Promise<{ ok: true; synced: number }> {
  const result = await postGasAction<{ sources?: Array<Record<string, unknown>> }>('getScrapeSources', {
    enabledOnly: false
  });
  const rows = Array.isArray(result.sources) ? result.sources : [];
  let synced = 0;
  for (let i = 0; i < rows.length; i++) {
    const mapped = mapGasSourceRow(rows[i] || {});
    if (!mapped.source_id) {
      continue;
    }
    const ref = sourceConfigsCollection().doc(mapped.source_id);
    const snapshot = await ref.get();
    const existing = snapshot.exists ? (snapshot.data() || {}) : {};
    await ref.set({
      source_id: mapped.source_id,
      name: mapped.name,
      enabled: mapped.enabled,
      scrape_page_urls: mapped.scrape_page_urls,
      scrape_page_id: mapped.scrape_page_id,
      priority: mapped.priority,
      min_interval_min: mapped.min_interval_min,
      retry_limit: mapped.retry_limit,
      retry_backoff_min: mapped.retry_backoff_min,
      daily_success_cap: mapped.daily_success_cap,
      max_tabs_per_site: mapped.max_tabs_per_site,
      leased_until: String(existing.leased_until || ''),
      last_started_at: String(existing.last_started_at || ''),
      last_success_at: String(existing.last_success_at || ''),
      last_failure_at: String(existing.last_failure_at || ''),
      consecutive_failures: Number(existing.consecutive_failures || 0)
    }, { merge: true });
    synced += 1;
  }
  return { ok: true, synced: synced };
}
