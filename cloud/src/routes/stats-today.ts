import { Router } from 'express';
import { requireMiniAppSession } from '../session-auth';
import { getDailyStats } from '../services/stats';

const router = Router();

router.get('/stats/today', requireMiniAppSession, async function(req, res, next) {
  try {
    const day = String(req.query.day || '').trim();
    const stats = await getDailyStats(day || undefined);
    res.json({ ok: true, stats: stats });
  } catch (error) {
    next(error);
  }
});

export default router;
