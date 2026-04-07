import { enqueueEnrichTask } from '../tasks';
import { jobsCollection } from '../firestore';
import { buildDedupeKey, normalizeKey } from './job-utils';
import { recordJobEvent } from './job-events';
import { isDailyCapExceededError } from './rollout-guards';

export async function normalizeJob(jobId: string, version: number): Promise<{ ok: true; skipped: boolean }> {
  const jobRef = jobsCollection().doc(jobId);
  const snapshot = await jobRef.get();
  if (!snapshot.exists) {
    throw new Error('Job not found: ' + jobId);
  }

  const job = snapshot.data() || {};
  if (Number(job.normalize_version || 0) >= version) {
    return { ok: true, skipped: true };
  }

  const normalizedTitle = normalizeKey(job.title);
  const normalizedCompany = normalizeKey(job.company);
  const normalizedLocation = normalizeKey(job.location);
  const normalizedApplyUrl = normalizeKey(job.apply_url || job.canonical_url);
  const dedupeKey = buildDedupeKey(
    String(job.title || ''),
    String(job.company || ''),
    String(job.location || ''),
    String(job.apply_url || job.canonical_url || '')
  );

  await jobRef.set({
    normalized_title: normalizedTitle,
    normalized_company: normalizedCompany,
    normalized_location: normalizedLocation,
    normalized_apply_url: normalizedApplyUrl,
    dedupe_key: dedupeKey,
    pipeline_stage: 'normalized',
    normalize_version: version
  }, { merge: true });

  await recordJobEvent(
    String(job.job_id || jobId),
    String(job.source_id || ''),
    String(job.scrape_run_id || ''),
    'normalized',
    { version: version, dedupe_key: dedupeKey }
  );

  try {
    await enqueueEnrichTask(jobId, version);
  } catch (error) {
    if (!isDailyCapExceededError(error)) {
      throw error;
    }
    await recordJobEvent(
      String(job.job_id || jobId),
      String(job.source_id || ''),
      String(job.scrape_run_id || ''),
      'task_enqueue_blocked',
      { queue: 'enrich', version: version, reason: error.message }
    );
  }
  return { ok: true, skipped: false };
}
