import { Router } from 'express';
import { config } from '../config';
import { handleTelegramWebhook } from '../services/bot';

const router = Router();

router.post('/telegram/webhook', async function(req, res, next) {
  try {
    const secretToken = String(req.header('x-telegram-bot-api-secret-token') || '').trim();
    if (config.telegramWebhookSecret && secretToken !== config.telegramWebhookSecret) {
      res.status(401).json({ ok: false, error: 'Invalid telegram webhook secret' });
      return;
    }
    const response = await handleTelegramWebhook(req.body || {});
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
