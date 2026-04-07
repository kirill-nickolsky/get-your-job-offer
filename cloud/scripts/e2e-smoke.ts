import crypto from 'node:crypto';
import http from 'node:http';
import { AddressInfo } from 'node:net';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function jsonHeaders(extra?: Record<string, string>): Record<string, string> {
  return Object.assign({
    'Content-Type': 'application/json'
  }, extra || {});
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
    calls.push({
      path: String(req.url || ''),
      body: body
    });
    const response = handler(req, body);
    res.statusCode = response.status || 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(response.body));
  });
  await new Promise<void>(function(resolve) {
    server.listen(0, '127.0.0.1', function() {
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    server: server,
    url: 'http://127.0.0.1:' + address.port,
    calls: calls
  };
}

function buildAddonHeaders(path: string, payload: object, secret: string): Record<string, string> {
  const timestamp = new Date().toISOString();
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(['POST', path, timestamp, body].join('\n'))
    .digest('hex');
  return {
    'x-addon-key-id': 'default',
    'x-addon-timestamp': timestamp,
    'x-addon-signature': signature,
    'x-addon-token': secret
  };
}

async function postJson(url: string, payload: object, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: jsonHeaders(headers),
    body: JSON.stringify(payload)
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
    if (parsed.action === 'appendStage') {
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      return {
        body: {
          success: true,
          appended: rows.length
        }
      };
    }
    if (parsed.action === 'syncCloudJobStates') {
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      return {
        body: {
          success: true,
          updated: rows.length
        }
      };
    }
    if (parsed.action === 'getScrapeSources') {
      return {
        body: {
          success: true,
          sources: [
            {
              id: 'linkedin',
              name: 'LinkedIn',
              enabled: true,
              priority: 300,
              minIntervalMin: 1,
              retryLimit: 2,
              retryBackoffMin: 1,
              dailySuccessCap: 2,
              scrapePageUrl: 'https://www.linkedin.com/jobs/search/?keywords=backend'
            }
          ]
        }
      };
    }
    return {
      body: {
        success: false,
        error: 'Unknown action'
      }
    };
  });

  const telegramStub = await startJsonServer(function() {
    return {
      body: {
        ok: true,
        result: {
          message_id: 101
        }
      }
    };
  });

  const appPort = 18080;
  process.env.PORT = String(appPort);
  process.env.SERVICE_BASE_URL = 'http://127.0.0.1:' + appPort;
  process.env.TASKS_INLINE = 'true';
  process.env.DATA_BACKEND = 'memory';
  process.env.ADDON_AUTH_MODE = 'hmac';
  process.env.ADDON_HMAC_SECRET = 'test-addon-secret';
  process.env.INTERNAL_TASK_TOKEN = 'test-task-token';
  process.env.TASK_AUTH_MODE = 'shared-token';
  process.env.TELEGRAM_MODE = 'real';
  process.env.TELEGRAM_BOT_TOKEN = 'fake-token';
  process.env.TELEGRAM_CHAT_ID = '123456';
  process.env.TELEGRAM_API_BASE_URL = telegramStub.url;
  process.env.GAS_WEBAPP_URL = gasStub.url;
  process.env.ANALYTICS_SINK_MODE = 'jsonl';
  process.env.ANALYTICS_JSONL_PATH = 'tmp/e2e-analytics.jsonl';
  process.env.MINI_APP_SESSION_SECRET = 'miniapp-secret';

  const firestoreModule = await import('../src/firestore');
  firestoreModule.resetMemoryDb();
  const {
    sourceConfigsCollection,
    jobsCollection,
    scrapeRunsCollection,
    scrapeCommandsCollection,
    notificationsCollection,
    jobEventsCollection,
    dailyStatsCacheCollection
  } = firestoreModule;
  const { createApp } = await import('../src/index');

  await sourceConfigsCollection().doc('linkedin').set({
    source_id: 'linkedin',
    name: 'LinkedIn',
    enabled: true,
    scrape_page_urls: ['https://www.linkedin.com/jobs/search/?keywords=backend'],
    priority: 300,
    min_interval_min: 1,
    retry_limit: 2,
    retry_backoff_min: 1,
    daily_success_cap: 2,
    leased_until: '',
    last_started_at: '',
    last_success_at: '',
    last_failure_at: '',
    consecutive_failures: 0
  });

  const app = createApp();
  const server = await new Promise<http.Server>(function(resolve) {
    const instance = app.listen(appPort, '127.0.0.1', function() {
      resolve(instance);
    });
  });

  try {
    const planPayload = {
      addon_instance_id: 'smoke-addon',
      addon_version: '0.1.0',
      supported_sources: ['linkedin'],
      max_commands: 1
    };
    const plan = await postJson('http://127.0.0.1:' + appPort + '/scrape-plan', planPayload, buildAddonHeaders('/scrape-plan', planPayload, 'test-addon-secret')) as { commands?: Array<{ lease_id: string; source_id: string }> };

    assert(Array.isArray(plan.commands) && plan.commands.length === 1, 'Expected one scrape-plan command');
    const command = plan.commands![0];

    const resultPayload = {
      lease_id: command.lease_id,
      run_id: 'smoke-run-1',
      source_id: command.source_id,
      addon_instance_id: 'smoke-addon',
      started_at: '2026-03-16T10:00:00Z',
      finished_at: '2026-03-16T10:01:00Z',
      success: true,
      jobs: [
        {
          external_job_id: 'li-1',
          job_url: 'https://www.linkedin.com/jobs/view/li-1',
          job_apply_url: 'https://apply.example/li-1',
          job_title: 'Senior Backend Node Engineer Remote',
          job_company: 'Acme',
          job_location: 'Remote EU',
          job_tags: ['node', 'typescript', 'gcp'],
          job_description: 'GCP backend role'
        }
      ]
    };
    const result = await postJson('http://127.0.0.1:' + appPort + '/scrape-result', resultPayload, buildAddonHeaders('/scrape-result', resultPayload, 'test-addon-secret')) as { accepted?: boolean; jobs_new?: number; rate_tasks_enqueued?: number };

    assert(result.accepted === true, 'Expected scrape-result accepted');
    assert(result.jobs_new === 1, 'Expected one new job');
    assert(result.rate_tasks_enqueued === 1, 'Expected one normalize task');

    const jobsSnapshot = await jobsCollection().where('source_id', '==', 'linkedin').get();
    assert(jobsSnapshot.docs.length === 1, 'Expected one stored job');
    const job = jobsSnapshot.docs[0].data() || {};
    assert(job.pipeline_stage === 'synced', 'Expected job pipeline_stage synced');
    assert(job.status === '2Apply', 'Expected job status 2Apply');
    assert(Number(job.rate_num || 0) === 4, 'Expected rate_num 4');
    assert(String(job.notified_at || '').trim() !== '', 'Expected notified_at to be set');
    assert(String(job.work_mode_hint || '') === 'Remote', 'Expected work mode hint Remote');

    const commandSnapshot = await scrapeCommandsCollection().doc(command.lease_id).get();
    const commandDoc = commandSnapshot.data() || {};
    assert(commandDoc.status === 'completed', 'Expected scrape command status completed');

    const runSnapshot = await scrapeRunsCollection().doc('smoke-run-1').get();
    const run = runSnapshot.data() || {};
    assert(run.sheets_sync_status === 'done', 'Expected sheets_sync_status done');

    const notificationSnapshot = await notificationsCollection().doc(jobsSnapshot.docs[0].id + '_123456').get();
    assert(notificationSnapshot.exists === true, 'Expected notification doc');

    const eventsSnapshot = await jobEventsCollection().get();
    assert(eventsSnapshot.docs.length >= 5, 'Expected job events for ingest/normalize/enrich/rate/notify/sync');

    const todayKey = new Date().toISOString().slice(0, 10);
    const statsSnapshot = await dailyStatsCacheCollection().doc(todayKey).get();
    assert(statsSnapshot.exists === true, 'Expected daily stats cache doc');

    assert(gasStub.calls.length >= 2, 'Expected GAS stage sync and job-state sync');
    assert(telegramStub.calls.length === 1, 'Expected one Telegram call');

    console.log('E2E smoke passed');
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
    await new Promise<void>(function(resolve, reject) {
      telegramStub.server.close(function(error) {
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
