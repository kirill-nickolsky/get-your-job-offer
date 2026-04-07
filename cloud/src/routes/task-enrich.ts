import { Router } from 'express';
import { requireTaskAuth } from '../auth';
import { enrichJob } from '../services/enrich';

const router = Router();

router.post('/tasks/enrich', requireTaskAuth, async function(req, res, next) {
  try {
    const jobId = String((req.body && req.body.job_id) || '').trim();
    const version = Number((req.body && req.body.version) || 1);
    if (!jobId) {
      res.status(400).json({ ok: false, error: 'job_id is required' });
      return;
    }
    const response = await enrichJob(jobId, version);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
