import { Router } from 'express';
import { requireTaskAuth } from '../auth';
import { refreshDailyStats } from '../services/stats';

const router = Router();

router.post('/tasks/stats-refresh', requireTaskAuth, async function(req, res, next) {
  try {
    const day = String((req.body && req.body.day) || '').trim();
    const response = await refreshDailyStats(day || undefined);
    res.json({ ok: true, stats: response });
  } catch (error) {
    next(error);
  }
});

export default router;
