import { CloudTasksClient } from '@google-cloud/tasks';
import { config, requireConfig } from './config';
import { reserveDailyQuota } from './services/rollout-guards';

const client = new CloudTasksClient();

function buildQueuePath(queueName: string): string {
  return client.queuePath(
    requireConfig(config.gcpProjectId, 'GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required'),
    config.gcpLocation,
    queueName
  );
}

function buildTaskHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (config.taskAuthMode === 'shared-token' && config.internalTaskToken) {
    headers['x-task-token'] = config.internalTaskToken;
  }
  return headers;
}

async function postInline(path: string, payload: object): Promise<void> {
  const baseUrl = requireConfig(config.serviceBaseUrl, 'SERVICE_BASE_URL is required when TASKS_INLINE=true');
  const response = await fetch(baseUrl.replace(/\/+$/, '') + path, {
    method: 'POST',
    headers: buildTaskHeaders(),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error('Inline task failed: ' + response.status + ' ' + text.substring(0, 200));
  }
}

async function enqueueHttpTask(queueName: string, path: string, payload: object): Promise<void> {
  await reserveDailyQuota('task_enqueues', config.taskEnqueueDailyCap, 1);

  if (config.tasksInline) {
    await postInline(path, payload);
    return;
  }

  const baseUrl = requireConfig(config.serviceBaseUrl, 'SERVICE_BASE_URL is required');
  const parent = buildQueuePath(queueName);
  const url = baseUrl.replace(/\/+$/, '') + path;
  const httpRequest: Record<string, unknown> = {
    httpMethod: 'POST',
    url: url,
    headers: buildTaskHeaders(),
    body: Buffer.from(JSON.stringify(payload)).toString('base64')
  };

  if (config.taskAuthMode === 'oidc') {
    httpRequest.oidcToken = {
      serviceAccountEmail: requireConfig(
        config.taskOidcServiceAccountEmail,
        'TASK_OIDC_SERVICE_ACCOUNT_EMAIL is required when TASK_AUTH_MODE=oidc'
      ),
      audience: requireConfig(config.taskOidcAudience, 'TASK_OIDC_AUDIENCE is required when TASK_AUTH_MODE=oidc')
    };
  }

  await client.createTask({
    parent: parent,
    task: {
      httpRequest: httpRequest as never
    }
  });
}

export async function enqueueNormalizeTask(jobId: string, version: number): Promise<void> {
  await enqueueHttpTask(config.taskQueueNormalize, '/tasks/normalize', { job_id: jobId, version: version });
}

export async function enqueueEnrichTask(jobId: string, version: number): Promise<void> {
  await enqueueHttpTask(config.taskQueueEnrich, '/tasks/enrich', { job_id: jobId, version: version });
}

export async function enqueueRateTask(jobId: string, version?: number): Promise<void> {
  await enqueueHttpTask(config.taskQueueRate, '/tasks/rate', {
    job_id: jobId,
    version: version || 1
  });
}

export async function enqueueNotifyTask(jobId: string): Promise<void> {
  await enqueueHttpTask(config.taskQueueNotify, '/tasks/notify', { job_id: jobId });
}

export async function enqueueSyncRunStageTask(runId: string, sourceId: string): Promise<void> {
  await enqueueHttpTask(config.taskQueueSyncSheets, '/tasks/sync-sheets', {
    kind: 'stage-run',
    run_id: runId,
    source_id: sourceId
  });
}

export async function enqueueSyncJobStateTask(jobId: string, status: string, rateNum: number, rateReason: string, rateProvider: string): Promise<void> {
  await enqueueHttpTask(config.taskQueueSyncSheets, '/tasks/sync-sheets', {
    kind: 'job-state',
    job_id: jobId,
    status: status,
    rate_num: rateNum,
    rate_reason: rateReason,
    rate_provider: rateProvider
  });
}

export async function enqueueStatsRefreshTask(reason: string, day?: string): Promise<void> {
  await enqueueHttpTask(config.taskQueueStatsRefresh, '/tasks/stats-refresh', {
    reason: reason,
    day: day || ''
  });
}
