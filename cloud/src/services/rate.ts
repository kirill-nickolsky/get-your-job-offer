import { jobsCollection, rateTasksCollection } from '../firestore';
import { enqueueNotifyTask, enqueueStatsRefreshTask, enqueueSyncJobStateTask } from '../tasks';
import { recordJobEvent } from './job-events';
import { getRateProvider } from './rate-providers';
import { isDailyCapExceededError } from './rollout-guards';

export async function rateJob(jobId: string, version: number): Promise<{
  ok: true;
  enqueuedNotify: boolean;
  enqueuedSyncSheets: boolean;
  rateNum: number;
  status: string;
}> {
  const jobRef = jobsCollection().doc(jobId);
  const taskRef = rateTasksCollection().doc(jobId);
  const jobSnapshot = await jobRef.get();
  const taskSnapshot = await taskRef.get();
  if (!jobSnapshot.exists) {
    throw new Error('Job not found: ' + jobId);
  }

  const job = jobSnapshot.data() || {};
  if (Number(job.rate_version || 0) >= version) {
    return {
      ok: true,
      enqueuedNotify: false,
      enqueuedSyncSheets: false,
      rateNum: Number(job.rate_num || 0),
      status: String(job.status || 'new')
    };
  }

  const task = taskSnapshot.exists ? (taskSnapshot.data() || {}) : {};
  const nowIso = new Date().toISOString();
  await taskRef.set({
    job_id: jobId,
    status: 'running',
    updated_at: nowIso,
    attempt: Number(task.attempt || 0) + 1,
    error: ''
  }, { merge: true });

  const provider = getRateProvider();
  const result = await provider.rate({
    title: String(job.title || ''),
    location: String(job.location || ''),
    tags: Array.isArray(job.tags) ? job.tags.map(function(item) { return String(item || ''); }) : [],
    description: String(job.description || ''),
    enrich_summary: String(job.enrich_summary || '')
  });

  await jobRef.set({
    rate_status: 'done',
    rate_num: result.rate_num,
    rate_reason: result.rate_reason,
    rate_provider: result.provider,
    rated_model: result.model,
    status: result.status,
    pipeline_stage: 'rated',
    rate_version: version,
    sheet_sync_version: version
  }, { merge: true });

  await taskRef.set({
    status: 'done',
    updated_at: nowIso,
    error: ''
  }, { merge: true });

  await recordJobEvent(
    String(job.job_id || jobId),
    String(job.source_id || ''),
    String(job.scrape_run_id || ''),
    'rated',
    {
      version: version,
      rate_num: result.rate_num,
      status: result.status,
      provider: result.provider
    }
  );

  let enqueuedSyncSheets = false;
  try {
    await enqueueSyncJobStateTask(jobId, result.status, result.rate_num, result.rate_reason, result.provider);
    enqueuedSyncSheets = true;
  } catch (error) {
    if (!isDailyCapExceededError(error)) {
      throw error;
    }
    await recordJobEvent(
      String(job.job_id || jobId),
      String(job.source_id || ''),
      String(job.scrape_run_id || ''),
      'task_enqueue_blocked',
      { queue: 'sync-sheets', version: version, reason: error.message }
    );
  }

  try {
    await enqueueStatsRefreshTask('rate');
  } catch (error) {
    if (!isDailyCapExceededError(error)) {
      throw error;
    }
    await recordJobEvent(
      String(job.job_id || jobId),
      String(job.source_id || ''),
      String(job.scrape_run_id || ''),
      'task_enqueue_blocked',
      { queue: 'stats-refresh', version: version, reason: error.message }
    );
  }

  let enqueuedNotify = false;
  if (result.rate_num >= 4 && result.status === '2Apply' && !String(job.notified_at || '').trim()) {
    try {
      await enqueueNotifyTask(jobId);
      enqueuedNotify = true;
    } catch (error) {
      if (!isDailyCapExceededError(error)) {
        throw error;
      }
      await recordJobEvent(
        String(job.job_id || jobId),
        String(job.source_id || ''),
        String(job.scrape_run_id || ''),
        'task_enqueue_blocked',
        { queue: 'notify', version: version, reason: error.message }
      );
    }
  }

  return {
    ok: true,
    enqueuedNotify: enqueuedNotify,
    enqueuedSyncSheets: enqueuedSyncSheets,
    rateNum: result.rate_num,
    status: result.status
  };
}
