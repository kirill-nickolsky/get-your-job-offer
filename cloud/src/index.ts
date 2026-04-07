import express from 'express';
import { config } from './config';
import healthRouter from './routes/health';
import scrapePlanRouter from './routes/scrape-plan';
import scrapeResultRouter from './routes/scrape-result';
import enqueueRateRouter from './routes/enqueue-rate';
import internalSourceSyncRouter from './routes/internal-source-sync';
import taskRateRouter from './routes/task-rate';
import taskNormalizeRouter from './routes/task-normalize';
import taskEnrichRouter from './routes/task-enrich';
import taskNotifyRouter from './routes/task-notify';
import taskSyncSheetsRouter from './routes/task-sync-sheets';
import taskStatsRefreshRouter from './routes/task-stats-refresh';
import botJobsRouter from './routes/bot-jobs';
import botApplyActionRouter from './routes/bot-apply-action';
import statsTodayRouter from './routes/stats-today';
import sessionTelegramRouter from './routes/session-telegram';
import telegramWebhookRouter from './routes/telegram-webhook';
import miniAppRouter from './routes/miniapp';
import { attachRequestContext, getRequestId, logError } from './logger';

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(attachRequestContext);
  app.use(function(req, res, next) {
    res.setHeader('x-request-id', getRequestId(req));
    next();
  });

  app.use(healthRouter);
  app.use(scrapePlanRouter);
  app.use(scrapeResultRouter);
  app.use(enqueueRateRouter);
  app.use(internalSourceSyncRouter);
  app.use(taskNormalizeRouter);
  app.use(taskEnrichRouter);
  app.use(taskRateRouter);
  app.use(taskNotifyRouter);
  app.use(taskSyncSheetsRouter);
  app.use(taskStatsRefreshRouter);
  app.use(sessionTelegramRouter);
  app.use(botJobsRouter);
  app.use(botApplyActionRouter);
  app.use(statsTodayRouter);
  app.use(telegramWebhookRouter);
  app.use(miniAppRouter);

  app.use(function(error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logError(req, 'Unhandled cloud error', {
      error: message
    });
    res.status(500).json({
      ok: false,
      error: message
    });
  });

  return app;
}

export function startServer(): void {
  const app = createApp();
  app.listen(config.port, function() {
    console.log('[cloud] listening on port', config.port);
  });
}

if (require.main === module) {
  startServer();
}
