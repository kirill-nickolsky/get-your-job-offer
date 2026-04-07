import crypto from 'node:crypto';
import { ScrapeJobInput, ScrapeResultRequest, ScrapeResultResponse, ScrapeRunDoc } from '../contracts';
import {
  jobsCollection,
  rateTasksCollection,
  scrapeCommandsCollection,
  scrapeRunsCollection,
  sourceConfigsCollection
} from '../firestore';
import { enqueueNormalizeTask, enqueueSyncRunStageTask } from '../tasks';
import { config } from '../config';
import { writeAnalyticsEvent } from '../event-sink';
import { recordJobEvent } from './job-events';
import { buildDedupeKey, buildJobId, normalizeKey, normalizeString, normalizeTags } from './job-utils';
import { isDailyCapExceededError } from './rollout-guards';

function uniqueJobs(sourceId: string, jobs: ScrapeJobInput[]): Array<ScrapeJobInput & { job_id: string }> {
  const seen = new Set<string>();
  const result: Array<ScrapeJobInput & { job_id: string }> = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const jobId = buildJobId(sourceId, job);
    if (seen.has(jobId)) {
      continue;
    }
    seen.add(jobId);
    result.push(Object.assign({}, job, { job_id: jobId }));
  }
  return result;
}

export async function ingestScrapeResult(request: ScrapeResultRequest): Promise<ScrapeResultResponse> {
  const sourceId = normalizeString(request.source_id);
  const nowIso = new Date().toISOString();
  const runId = normalizeString(request.run_id) || crypto.randomUUID();
  const leaseId = normalizeString(request.lease_id);
  const dedupedJobs = uniqueJobs(sourceId, Array.isArray(request.jobs) ? request.jobs : []);
  const sourceRef = sourceConfigsCollection().doc(sourceId);
  const sourceSnapshot = await sourceRef.get();
  const sourceData = sourceSnapshot.exists ? (sourceSnapshot.data() || {}) : {};
  const previousFailures = Number(sourceData.consecutive_failures || 0);
  const commandRef = leaseId ? scrapeCommandsCollection().doc(leaseId) : null;

  if (commandRef) {
    const commandSnapshot = await commandRef.get();
    if (commandSnapshot.exists) {
      const command = commandSnapshot.data() || {};
      if (String(command.status || '') === 'completed' && String(command.run_id || '').trim()) {
        const existingRunSnapshot = await scrapeRunsCollection().doc(String(command.run_id || '').trim()).get();
        const existingRun = existingRunSnapshot.exists ? (existingRunSnapshot.data() || {}) : {};
        return {
          accepted: true,
          jobs_new: Number(existingRun.jobs_new || 0),
          rate_tasks_enqueued: Number(existingRun.jobs_new || 0)
        };
      }
    }
  }

  let jobsNew = 0;
  let rateTasksEnqueued = 0;
  const normalizeTaskPayloads: Array<{ jobId: string; version: number }> = [];

  for (let index = 0; index < dedupedJobs.length; index++) {
    const job = dedupedJobs[index];
    const ref = jobsCollection().doc(job.job_id);
    const snapshot = await ref.get();
    const exists = snapshot.exists;
    const title = normalizeString(job.job_title);
    const company = normalizeString(job.job_company);
    const location = normalizeString(job.job_location);
    const canonicalUrl = normalizeString(job.job_url);
    const applyUrl = normalizeString(job.job_apply_url) || canonicalUrl;
    const pipelineVersion = 1;

    if (!exists) {
      jobsNew += 1;
      normalizeTaskPayloads.push({ jobId: job.job_id, version: pipelineVersion });
      await rateTasksCollection().doc(job.job_id).set({
        job_id: job.job_id,
        status: 'queued',
        attempt: 0,
        created_at: nowIso,
        updated_at: nowIso,
        error: ''
      }, { merge: true });

      await ref.set({
        job_id: job.job_id,
        source_id: sourceId,
        external_job_id: normalizeString(job.external_job_id),
        canonical_url: canonicalUrl,
        apply_url: applyUrl,
        title: title,
        company: company,
        location: location,
        tags: normalizeTags(job.job_tags),
        description: normalizeString(job.job_description),
        scrape_run_id: runId,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        is_new: true,
        pipeline_stage: 'ingested',
        pipeline_version: pipelineVersion,
        normalize_version: 0,
        enrich_version: 0,
        rate_version: 0,
        sheet_sync_version: 0,
        normalized_title: normalizeKey(title),
        normalized_company: normalizeKey(company),
        normalized_location: normalizeKey(location),
        normalized_apply_url: normalizeKey(applyUrl),
        dedupe_key: buildDedupeKey(title, company, location, applyUrl),
        enrich_summary: '',
        enrich_keywords: [],
        work_mode_hint: 'Unknown',
        rate_status: 'pending',
        rate_num: 0,
        rate_reason: '',
        rate_provider: '',
        rated_model: '',
        status: 'new',
        notified_at: ''
      }, { merge: true });
      await recordJobEvent(job.job_id, sourceId, runId, 'ingested', {
        is_new: true,
        title: title
      });
      continue;
    }

    await ref.set({
      source_id: sourceId,
      external_job_id: normalizeString(job.external_job_id),
      canonical_url: canonicalUrl,
      apply_url: applyUrl,
      title: title,
      company: company,
      location: location,
      tags: normalizeTags(job.job_tags),
      description: normalizeString(job.job_description),
      scrape_run_id: runId,
      last_seen_at: nowIso,
      is_new: false
    }, { merge: true });
    await recordJobEvent(job.job_id, sourceId, runId, 'reseen', {
      is_new: false,
      title: title
    });
  }

  const runDoc: ScrapeRunDoc = {
    run_id: runId,
    source_id: sourceId,
    lease_id: leaseId,
    addon_instance_id: normalizeString(request.addon_instance_id),
    started_at: normalizeString(request.started_at),
    finished_at: normalizeString(request.finished_at) || nowIso,
    success: request.success === true,
    jobs_received: dedupedJobs.length,
    jobs_new: jobsNew,
    error_code: normalizeString(request.error_code),
    error_message: normalizeString(request.error_message),
    sheets_sync_status: jobsNew > 0 && config.gasWebAppUrl ? 'queued' : '',
    sheets_sync_at: '',
    sheets_sync_error: ''
  };

  await scrapeRunsCollection().doc(runId).set(runDoc as unknown as Record<string, unknown>, { merge: true });
  await sourceRef.set({
    leased_until: '',
    last_success_at: request.success === true ? runDoc.finished_at : String(sourceData.last_success_at || ''),
    last_failure_at: request.success === true ? '' : runDoc.finished_at,
    consecutive_failures: request.success === true ? 0 : previousFailures + 1
  }, { merge: true });

  if (commandRef) {
    await commandRef.set({
      status: request.success === true ? 'completed' : 'failed',
      completed_at: runDoc.finished_at,
      run_id: runId,
      error_code: runDoc.error_code,
      error_message: runDoc.error_message
    }, { merge: true });
  }

  let normalizeQueueBlocked = false;
  for (let i = 0; i < normalizeTaskPayloads.length; i++) {
    const payload = normalizeTaskPayloads[i];
    if (normalizeQueueBlocked) {
      await rateTasksCollection().doc(payload.jobId).set({
        status: 'blocked',
        updated_at: nowIso,
        error: 'Daily task enqueue cap reached'
      }, { merge: true });
      await recordJobEvent(payload.jobId, sourceId, runId, 'task_enqueue_blocked', {
        queue: 'normalize',
        version: payload.version,
        reason: 'Daily task enqueue cap reached'
      });
      continue;
    }

    try {
      await enqueueNormalizeTask(payload.jobId, payload.version);
      rateTasksEnqueued += 1;
    } catch (error) {
      if (!isDailyCapExceededError(error)) {
        throw error;
      }
      normalizeQueueBlocked = true;
      await rateTasksCollection().doc(payload.jobId).set({
        status: 'blocked',
        updated_at: nowIso,
        error: error.message
      }, { merge: true });
      await recordJobEvent(payload.jobId, sourceId, runId, 'task_enqueue_blocked', {
        queue: 'normalize',
        version: payload.version,
        reason: error.message
      });
    }
  }
  if (jobsNew > 0 && config.gasWebAppUrl) {
    try {
      await enqueueSyncRunStageTask(runId, sourceId);
    } catch (error) {
      if (!isDailyCapExceededError(error)) {
        throw error;
      }
    }
  }

  await writeAnalyticsEvent('scrape_run', {
    run_id: runId,
    source_id: sourceId,
    success: runDoc.success,
    jobs_received: runDoc.jobs_received,
    jobs_new: runDoc.jobs_new
  });

  return {
    accepted: true,
    jobs_new: jobsNew,
    rate_tasks_enqueued: rateTasksEnqueued
  };
}
