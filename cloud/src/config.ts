function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  const raw = String(value || '').trim();
  if (!raw) {
    return fallback;
  }
  return raw
    .split(',')
    .map(function(item) {
      return item.trim().toLowerCase();
    })
    .filter(Boolean);
}

export const config = {
  port: parseNumber(process.env.PORT, 8080),
  serviceBaseUrl: String(process.env.SERVICE_BASE_URL || '').trim(),
  dataBackend: String(process.env.DATA_BACKEND || 'firestore').trim().toLowerCase(),
  analyticsSinkMode: String(process.env.ANALYTICS_SINK_MODE || 'noop').trim().toLowerCase(),
  analyticsJsonlPath: String(process.env.ANALYTICS_JSONL_PATH || 'tmp/analytics-events.jsonl').trim(),
  taskQueueRate: String(process.env.TASK_QUEUE_RATE || 'vacancy-rate').trim(),
  taskQueueNormalize: String(process.env.TASK_QUEUE_NORMALIZE || 'vacancy-normalize').trim(),
  taskQueueEnrich: String(process.env.TASK_QUEUE_ENRICH || 'vacancy-enrich').trim(),
  taskQueueNotify: String(process.env.TASK_QUEUE_NOTIFY || 'vacancy-notify').trim(),
  taskQueueSyncSheets: String(process.env.TASK_QUEUE_SYNC_SHEETS || 'sync-sheets').trim(),
  taskQueueStatsRefresh: String(process.env.TASK_QUEUE_STATS_REFRESH || 'stats-refresh').trim(),
  scrapePlanDailyCap: parseNumber(process.env.SCRAPE_PLAN_DAILY_CAP, 0),
  taskEnqueueDailyCap: parseNumber(process.env.TASK_ENQUEUE_DAILY_CAP, 0),
  notifyDailyCap: parseNumber(process.env.NOTIFY_DAILY_CAP, 0),
  gcpProjectId: String(process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '').trim(),
  gcpLocation: String(process.env.GCP_LOCATION || 'europe-west1').trim(),
  tasksInline: String(process.env.TASKS_INLINE || '').trim().toLowerCase() === 'true',
  scrapeLeaseMinutes: parseNumber(process.env.SCRAPE_LEASE_MINUTES, 15),
  defaultPollSeconds: parseNumber(process.env.DEFAULT_POLL_SECONDS, 300),
  requestIdHeader: String(process.env.REQUEST_ID_HEADER || 'x-request-id').trim().toLowerCase(),
  telegramBotToken: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  telegramChatId: String(process.env.TELEGRAM_CHAT_ID || '').trim(),
  telegramApiBaseUrl: String(process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org').trim(),
  telegramMode: String(process.env.TELEGRAM_MODE || 'real').trim().toLowerCase(),
  telegramWebhookSecret: String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim(),
  gasWebAppUrl: String(process.env.GAS_WEBAPP_URL || '').trim(),
  addonSharedToken: String(process.env.ADDON_SHARED_TOKEN || '').trim(),
  addonHmacSecret: String(process.env.ADDON_HMAC_SECRET || '').trim(),
  addonHmacKeyId: String(process.env.ADDON_HMAC_KEY_ID || 'default').trim(),
  addonHmacMaxSkewSec: parseNumber(process.env.ADDON_HMAC_MAX_SKEW_SEC, 300),
  internalTaskToken: String(process.env.INTERNAL_TASK_TOKEN || '').trim(),
  addonAuthMode: String(
    process.env.ADDON_AUTH_MODE ||
    (process.env.ADDON_HMAC_SECRET ? 'hmac' : (process.env.ADDON_SHARED_TOKEN ? 'shared-token' : 'none'))
  ).trim().toLowerCase(),
  taskAuthMode: String(
    process.env.TASK_AUTH_MODE ||
    (process.env.TASK_OIDC_AUDIENCE ? 'oidc' : (process.env.INTERNAL_TASK_TOKEN ? 'shared-token' : 'none'))
  ).trim().toLowerCase(),
  taskOidcAudience: String(process.env.TASK_OIDC_AUDIENCE || '').trim(),
  taskOidcIssuer: String(process.env.TASK_OIDC_ISSUER || '').trim(),
  taskOidcJwksUrl: String(process.env.TASK_OIDC_JWKS_URL || '').trim(),
  taskOidcServiceAccountEmail: String(process.env.TASK_OIDC_SERVICE_ACCOUNT_EMAIL || '').trim(),
  miniAppSessionSecret: String(process.env.MINI_APP_SESSION_SECRET || process.env.INTERNAL_TASK_TOKEN || 'dev-miniapp-secret').trim(),
  miniAppSessionTtlSec: parseNumber(process.env.MINI_APP_SESSION_TTL_SEC, 900),
  allowFakeTelegramSession: parseBoolean(process.env.ALLOW_FAKE_TELEGRAM_SESSION, true),
  rateProvider: String(process.env.RATE_PROVIDER || 'rule-based').trim().toLowerCase(),
  rateTargetKeywords: parseCsv(
    process.env.RATE_TARGET_KEYWORDS,
    ['backend', 'node', 'typescript', 'gcp', 'remote']
  ),
  rateDenyKeywords: parseCsv(
    process.env.RATE_DENY_KEYWORDS,
    ['intern', 'frontend', 'designer', 'qa']
  )
};

export function requireConfig(value: string, message: string): string {
  if (!value) {
    throw new Error(message);
  }
  return value;
}
