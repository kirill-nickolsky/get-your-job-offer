import { config } from '../config';
import { DocSnapshotLike, jobsCollection, scrapeRunsCollection } from '../firestore';
import { postGasAction } from './gas';
import { recordJobEvent } from './job-events';

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function buildStageRows(sourceId: string, jobs: DocSnapshotLike[]): Array<Record<string, string | number>> {
  return jobs.map(function(snapshot) {
    const job = snapshot.data() || {};
    return {
      JobId: normalizeString(job.external_job_id),
      JobTitle: normalizeString(job.title),
      JobCompany: normalizeString(job.company),
      JobLocation: normalizeString(job.location),
      JobTags: Array.isArray(job.tags) ? job.tags.join(', ') : '',
      JobDescription: normalizeString(job.description),
      JobUrl: normalizeString(job.canonical_url),
      JobApplyUrl: normalizeString(job.apply_url),
      ScrapePageName: sourceId
    };
  });
}

export async function syncRunToGasStage(runId: string, sourceId: string): Promise<{ ok: true; appended: number; skipped: boolean }> {
  if (!config.gasWebAppUrl) {
    return { ok: true, appended: 0, skipped: true };
  }

  const runRef = scrapeRunsCollection().doc(runId);
  const jobsSnapshot = await jobsCollection().where('scrape_run_id', '==', runId).get();
  const newJobs = jobsSnapshot.docs.filter(function(doc) {
    const job = doc.data() || {};
    return job.is_new === true;
  });

  if (newJobs.length === 0) {
    await runRef.set({
      sheets_sync_status: 'done',
      sheets_sync_at: new Date().toISOString(),
      sheets_sync_error: ''
    }, { merge: true });
    return { ok: true, appended: 0, skipped: false };
  }

  const response = await postGasAction<{ appended?: number }>('appendStage', {
    scrapePageName: sourceId,
    rows: buildStageRows(sourceId, newJobs)
  });

  await runRef.set({
    sheets_sync_status: 'done',
    sheets_sync_at: new Date().toISOString(),
    sheets_sync_error: ''
  }, { merge: true });

  return {
    ok: true,
    appended: Number(response.appended || newJobs.length),
    skipped: false
  };
}

export async function syncJobStateToGas(
  jobId: string,
  status: string,
  rateNum: number,
  rateReason: string,
  rateProvider: string
): Promise<{ ok: true; updated: number; skipped: boolean }> {
  if (!config.gasWebAppUrl) {
    return { ok: true, updated: 0, skipped: true };
  }

  const snapshot = await jobsCollection().doc(jobId).get();
  if (!snapshot.exists) {
    throw new Error('Job not found: ' + jobId);
  }
  const job = snapshot.data() || {};

  const response = await postGasAction<{ updated?: number }>('syncCloudJobStates', {
    rows: [{
      JobId: normalizeString(job.external_job_id),
      JobUrl: normalizeString(job.canonical_url),
      JobApplyUrl: normalizeString(job.apply_url),
      JobTitle: normalizeString(job.title),
      JobCompany: normalizeString(job.company),
      JobLocation: normalizeString(job.location),
      JobRateNum: rateNum,
      JobRateDesc: rateReason,
      JobRateShortDesc: rateReason,
      RatedModelName: rateProvider,
      Status: status
    }]
  });

  await jobsCollection().doc(jobId).set({
    pipeline_stage: 'synced'
  }, { merge: true });
  await recordJobEvent(
    String(job.job_id || jobId),
    String(job.source_id || ''),
    String(job.scrape_run_id || ''),
    'synced',
    { status: status, rate_num: rateNum }
  );

  return {
    ok: true,
    updated: Number(response.updated || 0),
    skipped: false
  };
}
