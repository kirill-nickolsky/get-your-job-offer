import { Router } from 'express';
import { requireMiniAppSession } from '../session-auth';
import { applyJobAction } from '../services/bot';

const router = Router();

router.post('/bot/apply-action', requireMiniAppSession, async function(req, res, next) {
  try {
    const sessionUser = (req as typeof req & { sessionUser?: { telegram_user_id: string } }).sessionUser;
    const jobId = String((req.body && req.body.job_id) || '').trim();
    const action = String((req.body && req.body.action) || '').trim() as 'apply' | 'delete' | 'later';
    const note = String((req.body && req.body.note) || '').trim();
    if (!jobId || !action) {
      res.status(400).json({ ok: false, error: 'job_id and action are required' });
      return;
    }
    const response = await applyJobAction({
      jobId: jobId,
      action: action,
      note: note,
      telegramUserId: String(sessionUser && sessionUser.telegram_user_id || ''),
      source: 'miniapp'
    });
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
