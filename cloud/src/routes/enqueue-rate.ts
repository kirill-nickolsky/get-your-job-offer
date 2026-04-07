import { Router } from 'express';
import { requireTaskAuth } from '../auth';
import { jobsCollection, rateTasksCollection } from '../firestore';
import { enqueueRateTask } from '../tasks';

const router = Router();

router.post('/enqueue-rate', requireTaskAuth, async function(req, res, next) {
  try {
    const jobIds = Array.isArray(req.body && req.body.job_ids) ? req.body.job_ids : [];
    const accepted: string[] = [];
    for (let i = 0; i < jobIds.length; i++) {
      const jobId = String(jobIds[i] || '').trim();
      if (!jobId) {
        continue;
      }
      const jobSnapshot = await jobsCollection().doc(jobId).get();
      if (!jobSnapshot.exists) {
        continue;
      }
      const job = jobSnapshot.data() || {};
      const nextVersion = Number(job.rate_version || 0) + 1;
      await jobsCollection().doc(jobId).set({
        rate_status: 'pending'
      }, { merge: true });
      await rateTasksCollection().doc(jobId).set({
        job_id: jobId,
        status: 'queued',
        updated_at: new Date().toISOString(),
        error: ''
      }, { merge: true });
      await enqueueRateTask(jobId, nextVersion);
      accepted.push(jobId);
    }
    res.json({ ok: true, accepted_count: accepted.length, job_ids: accepted });
  } catch (error) {
    next(error);
  }
});

export default router;
