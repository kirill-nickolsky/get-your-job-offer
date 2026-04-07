import { jobsCollection } from '../firestore';
import { enqueueRateTask } from '../tasks';
import { inferWorkMode } from './job-utils';
import { recordJobEvent } from './job-events';
import { isDailyCapExceededError } from './rollout-guards';

export async function enrichJob(jobId: string, version: number): Promise<{ ok: true; skipped: boolean }> {
  const jobRef = jobsCollection().doc(jobId);
  const snapshot = await jobRef.get();
  if (!snapshot.exists) {
    throw new Error('Job not found: ' + jobId);
  }

  const job = snapshot.data() || {};
  if (Number(job.enrich_version || 0) >= version) {
    return { ok: true, skipped: true };
  }

  const keywords = Array.isArray(job.tags)
    ? job.tags.map(function(item) { return String(item || '').trim().toLowerCase(); }).filter(Boolean)
    : [];
  const workModeHint = inferWorkMode(String(job.location || ''), String(job.description || ''));
  const enrichSummary = [
    keywords.length > 0 ? ('Tags: ' + keywords.slice(0, 5).join(', ')) : '',
    workModeHint !== 'Unknown' ? ('WorkMode: ' + workModeHint) : ''
  ].filter(Boolean).join(' | ');

  await jobRef.set({
    enrich_keywords: keywords,
    work_mode_hint: workModeHint,
    enrich_summary: enrichSummary,
    pipeline_stage: 'enriched',
    enrich_version: version
  }, { merge: true });

  await recordJobEvent(
    String(job.job_id || jobId),
    String(job.source_id || ''),
    String(job.scrape_run_id || ''),
    'enriched',
    { version: version, work_mode_hint: workModeHint }
  );

  try {
    await enqueueRateTask(jobId, version);
  } catch (error) {
    if (!isDailyCapExceededError(error)) {
      throw error;
    }
    await recordJobEvent(
      String(job.job_id || jobId),
      String(job.source_id || ''),
      String(job.scrape_run_id || ''),
      'task_enqueue_blocked',
      { queue: 'rate', version: version, reason: error.message }
    );
  }
  return { ok: true, skipped: false };
}
