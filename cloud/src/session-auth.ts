import type express from 'express';
import { verifySessionToken } from './services/session';

export function requireMiniAppSession(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = String(req.header('authorization') || '').trim();
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.substring(7).trim()
    : '';
  if (!token) {
    res.status(401).json({ ok: false, error: 'Missing bearer session token' });
    return;
  }
  try {
    const payload = verifySessionToken(token);
    (req as express.Request & { sessionUser?: { telegram_user_id: string; username: string; first_name: string } }).sessionUser = {
      telegram_user_id: payload.telegram_user_id,
      username: payload.username,
      first_name: payload.first_name
    };
    next();
  } catch (error) {
    res.status(401).json({ ok: false, error: 'Invalid session token' });
  }
}
