import crypto from 'node:crypto';
import { ApplyActionType } from '../contracts';
import { applyActionsCollection, botUsersCollection, jobsCollection } from '../firestore';
import { enqueueStatsRefreshTask, enqueueSyncJobStateTask } from '../tasks';
import { recordJobEvent } from './job-events';
import { isDailyCapExceededError } from './rollout-guards';
import { getDailyStats } from './stats';
import { sendTelegramText } from './telegram-client';

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

export async function listGoodJobs(minRate: number, limit: number): Promise<Array<Record<string, unknown>>> {
  const snapshot = await jobsCollection().get();
  return snapshot.docs
    .map(function(doc) { return doc.data() || {}; })
    .filter(function(job) {
      return Number(job.rate_num || 0) >= minRate && String(job.status || '') === '2Apply';
    })
    .sort(function(a, b) {
      return String(b.last_seen_at || '').localeCompare(String(a.last_seen_at || ''));
    })
    .slice(0, limit)
    .map(function(job) {
      return {
        job_id: String(job.job_id || ''),
        title: String(job.title || ''),
        company: String(job.company || ''),
        location: String(job.location || ''),
        rate_num: Number(job.rate_num || 0),
        rate_reason: String(job.rate_reason || ''),
        status: String(job.status || ''),
        apply_url: String(job.apply_url || job.canonical_url || '')
      };
    });
}

export async function applyJobAction(input: {
  jobId: string;
  action: ApplyActionType;
  note?: string;
  telegramUserId: string;
  source: 'miniapp' | 'telegram-bot' | 'api';
}): Promise<{ ok: true; status: string }> {
  const jobId = normalizeString(input.jobId);
  const snapshot = await jobsCollection().doc(jobId).get();
  if (!snapshot.exists) {
    throw new Error('Job not found: ' + jobId);
  }
  const job = snapshot.data() || {};
  const action = input.action;
  let nextStatus = String(job.status || 'new');
  if (action === 'apply') {
    nextStatus = 'Applied';
  } else if (action === 'delete') {
    nextStatus = '2Delete';
  } else if (action === 'later') {
    nextStatus = '2Apply';
  }

  await jobsCollection().doc(jobId).set({
    status: nextStatus,
    pipeline_stage: action === 'apply' ? 'applied' : String(job.pipeline_stage || 'rated')
  }, { merge: true });

  const nowIso = new Date().toISOString();
  const actionId = crypto.randomUUID();
  await applyActionsCollection().doc(actionId).set({
    action_id: actionId,
    job_id: jobId,
    action: action,
    note: normalizeString(input.note),
    source: input.source,
    telegram_user_id: normalizeString(input.telegramUserId),
    created_at: nowIso
  }, { merge: true });

  await botUsersCollection().doc(normalizeString(input.telegramUserId)).set({
    telegram_user_id: normalizeString(input.telegramUserId),
    last_seen_at: nowIso,
    is_active: true
  }, { merge: true });

  await recordJobEvent(
    String(job.job_id || jobId),
    String(job.source_id || ''),
    String(job.scrape_run_id || ''),
    'apply_action',
    {
      action: action,
      next_status: nextStatus,
      telegram_user_id: normalizeString(input.telegramUserId)
    }
  );
  try {
    await enqueueSyncJobStateTask(jobId, nextStatus, Number(job.rate_num || 0), String(job.rate_reason || ''), String(job.rate_provider || ''));
  } catch (error) {
    if (!isDailyCapExceededError(error)) {
      throw error;
    }
    await recordJobEvent(
      String(job.job_id || jobId),
      String(job.source_id || ''),
      String(job.scrape_run_id || ''),
      'task_enqueue_blocked',
      { queue: 'sync-sheets', reason: error.message, source: input.source }
    );
  }
  try {
    await enqueueStatsRefreshTask('apply-action');
  } catch (error) {
    if (!isDailyCapExceededError(error)) {
      throw error;
    }
    await recordJobEvent(
      String(job.job_id || jobId),
      String(job.source_id || ''),
      String(job.scrape_run_id || ''),
      'task_enqueue_blocked',
      { queue: 'stats-refresh', reason: error.message, source: input.source }
    );
  }
  return { ok: true, status: nextStatus };
}

export async function handleTelegramWebhook(payload: Record<string, unknown>): Promise<{ ok: true }> {
  const message = payload.message as Record<string, unknown> | undefined;
  const callback = payload.callback_query as Record<string, unknown> | undefined;

  if (message) {
    const chatId = normalizeString(((message.chat as Record<string, unknown> | undefined) || {}).id);
    const text = normalizeString(message.text);
    if (text === '/jobs') {
      const jobs = await listGoodJobs(4, 5);
      const body = jobs.length > 0
        ? jobs.map(function(job, index) {
            return (index + 1) + '. ' + String(job.title || '') + ' / ' + String(job.company || '');
          }).join('\n')
        : 'No good jobs right now.';
      await sendTelegramText(chatId, body);
    } else if (text === '/today') {
      const stats = await getDailyStats();
      await sendTelegramText(chatId, 'Today: new=' + stats.totals.new_jobs + ', apply=' + stats.totals.apply_jobs + ', notified=' + stats.totals.notifications_sent);
    } else if (text === '/start') {
      await sendTelegramText(chatId, 'get-your-offer bot is ready.');
    }
  }

  if (callback) {
    const data = normalizeString(callback.data);
    const from = (callback.from as Record<string, unknown> | undefined) || {};
    const telegramUserId = normalizeString(from.id);
    const parts = data.split(':');
    if (parts.length === 2) {
      if (parts[0] === 'apply') {
        await applyJobAction({ jobId: parts[1], action: 'apply', telegramUserId: telegramUserId, source: 'telegram-bot' });
      } else if (parts[0] === 'delete') {
        await applyJobAction({ jobId: parts[1], action: 'delete', telegramUserId: telegramUserId, source: 'telegram-bot' });
      } else if (parts[0] === 'later') {
        await applyJobAction({ jobId: parts[1], action: 'later', telegramUserId: telegramUserId, source: 'telegram-bot' });
      }
    }
  }

  return { ok: true };
}
