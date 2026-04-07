import http from 'node:http';
import { AddressInfo } from 'node:net';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function startJsonServer(
  handler: (req: http.IncomingMessage, body: string) => { status?: number; body: unknown }
): Promise<{ server: http.Server; url: string; calls: Array<{ path: string; body: string }> }> {
  const calls: Array<{ path: string; body: string }> = [];
  const server = http.createServer(async function(req, res) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks).toString('utf8');
    calls.push({ path: String(req.url || ''), body: body });
    const response = handler(req, body);
    res.statusCode = response.status || 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(response.body));
  });
  await new Promise<void>(function(resolve) {
    server.listen(0, '127.0.0.1', function() { resolve(); });
  });
  const address = server.address() as AddressInfo;
  return {
    server: server,
    url: 'http://127.0.0.1:' + address.port,
    calls: calls
  };
}

async function api(url: string, method: string, body?: object, token?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }
  const response = await fetch(url, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error('HTTP ' + response.status + ': ' + text);
  }
  return JSON.parse(text);
}

async function main(): Promise<void> {
  const gasStub = await startJsonServer(function(_req, body) {
    const parsed = JSON.parse(body || '{}');
    if (parsed.action === 'syncCloudJobStates') {
      return { body: { success: true, updated: Array.isArray(parsed.rows) ? parsed.rows.length : 0 } };
    }
    return { body: { success: true, appended: 0 } };
  });

  const appPort = 18081;
  process.env.PORT = String(appPort);
  process.env.SERVICE_BASE_URL = 'http://127.0.0.1:' + appPort;
  process.env.TASKS_INLINE = 'true';
  process.env.DATA_BACKEND = 'memory';
  process.env.TASK_AUTH_MODE = 'shared-token';
  process.env.INTERNAL_TASK_TOKEN = 'test-task-token';
  process.env.TELEGRAM_MODE = 'fake';
  process.env.TELEGRAM_CHAT_ID = '123456';
  process.env.GAS_WEBAPP_URL = gasStub.url;
  process.env.MINI_APP_SESSION_SECRET = 'miniapp-secret';
  process.env.ALLOW_FAKE_TELEGRAM_SESSION = 'true';

  const firestoreModule = await import('../src/firestore');
  firestoreModule.resetMemoryDb();
  const { jobsCollection, applyActionsCollection, botUsersCollection } = firestoreModule;
  const { createApp } = await import('../src/index');

  await jobsCollection().doc('job-1').set({
    job_id: 'job-1',
    source_id: 'linkedin',
    external_job_id: 'li-1',
    canonical_url: 'https://example.com/job-1',
    apply_url: 'https://apply.example/job-1',
    title: 'Senior Backend Engineer',
    company: 'Acme',
    location: 'Remote',
    tags: ['node'],
    description: 'Remote backend role',
    scrape_run_id: 'run-1',
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    is_new: true,
    pipeline_stage: 'rated',
    pipeline_version: 1,
    normalize_version: 1,
    enrich_version: 1,
    rate_version: 1,
    sheet_sync_version: 0,
    normalized_title: 'senior backend engineer',
    normalized_company: 'acme',
    normalized_location: 'remote',
    normalized_apply_url: 'https://apply.example/job-1',
    dedupe_key: 'd1',
    enrich_summary: 'Tags: node',
    enrich_keywords: ['node'],
    work_mode_hint: 'Remote',
    rate_status: 'done',
    rate_num: 4,
    rate_reason: 'Target keywords: backend, remote',
    rate_provider: 'rule-based',
    rated_model: 'rule-based-v1',
    status: '2Apply',
    notified_at: ''
  });

  const app = createApp();
  const server = await new Promise<http.Server>(function(resolve) {
    const instance = app.listen(appPort, '127.0.0.1', function() {
      resolve(instance);
    });
  });

  try {
    const session = await api('http://127.0.0.1:' + appPort + '/session/telegram', 'POST', {
      mode: 'fake',
      user_id: 'u-1',
      first_name: 'Local'
    }) as { session_token: string };
    assert(Boolean(session.session_token), 'Expected session token');

    const jobs = await api('http://127.0.0.1:' + appPort + '/bot/jobs?min_rate=4&limit=10', 'GET', undefined, session.session_token) as { items?: Array<{ job_id: string }> };
    assert(Array.isArray(jobs.items) && jobs.items.length === 1, 'Expected one good job');

    const action = await api('http://127.0.0.1:' + appPort + '/bot/apply-action', 'POST', {
      job_id: 'job-1',
      action: 'apply'
    }, session.session_token) as { status?: string };
    assert(action.status === 'Applied', 'Expected Applied status');

    const refreshedJob = await jobsCollection().doc('job-1').get();
    const refreshedData = refreshedJob.data() || {};
    assert(refreshedData.status === 'Applied', 'Expected Applied in stored job');

    const applyActionsSnapshot = await applyActionsCollection().get();
    assert(applyActionsSnapshot.docs.length === 1, 'Expected one apply action');

    const botUsersSnapshot = await botUsersCollection().doc('u-1').get();
    assert(botUsersSnapshot.exists === true, 'Expected bot user');

    const stats = await api('http://127.0.0.1:' + appPort + '/stats/today', 'GET', undefined, session.session_token) as { stats?: { totals?: { apply_actions?: number } } };
    assert(Number((stats.stats && stats.stats.totals && stats.stats.totals.apply_actions) || 0) >= 1, 'Expected apply actions in stats');

    const webhook = await api('http://127.0.0.1:' + appPort + '/telegram/webhook', 'POST', {
      message: {
        chat: { id: '123456' },
        text: '/today'
      }
    }) as { ok?: boolean };
    assert(webhook.ok === true, 'Expected webhook ok');

    console.log('Bot smoke passed');
  } finally {
    await new Promise<void>(function(resolve, reject) {
      server.close(function(error) {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await new Promise<void>(function(resolve, reject) {
      gasStub.server.close(function(error) {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
