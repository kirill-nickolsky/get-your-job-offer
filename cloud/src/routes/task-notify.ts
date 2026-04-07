import { Router } from 'express';
import { requireTaskAuth } from '../auth';
import { notifyJob } from '../services/notify';

const router = Router();

router.post('/tasks/notify', requireTaskAuth, async function(req, res, next) {
  try {
    const jobId = String((req.body && req.body.job_id) || '').trim();
    if (!jobId) {
      res.status(400).json({ ok: false, error: 'job_id is required' });
      return;
    }
    const response = await notifyJob(jobId);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
