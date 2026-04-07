import { Router } from 'express';
import { requireMiniAppSession } from '../session-auth';
import { listGoodJobs } from '../services/bot';

const router = Router();

router.get('/bot/jobs', requireMiniAppSession, async function(req, res, next) {
  try {
    const minRate = Math.max(1, Number(String(req.query.min_rate || '4')));
    const limit = Math.max(1, Math.min(50, Number(String(req.query.limit || '20'))));
    const items = await listGoodJobs(minRate, limit);
    res.json({ ok: true, items: items });
  } catch (error) {
    next(error);
  }
});

export default router;
