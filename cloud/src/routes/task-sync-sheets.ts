import { Router } from 'express';
import { requireTaskAuth } from '../auth';
import { syncJobStateToGas, syncRunToGasStage } from '../services/sync-sheets';

const router = Router();

router.post('/tasks/sync-sheets', requireTaskAuth, async function(req, res, next) {
  try {
    const kind = String((req.body && req.body.kind) || '').trim();
    let response;
    if (kind === 'stage-run') {
      const runId = String((req.body && req.body.run_id) || '').trim();
      const sourceId = String((req.body && req.body.source_id) || '').trim();
      if (!runId || !sourceId) {
        res.status(400).json({ ok: false, error: 'run_id and source_id are required for kind=stage-run' });
        return;
      }
      response = await syncRunToGasStage(runId, sourceId);
    } else if (kind === 'job-state') {
      const jobId = String((req.body && req.body.job_id) || '').trim();
      const status = String((req.body && req.body.status) || '').trim();
      const rateNum = Number((req.body && req.body.rate_num) || 0);
      const rateReason = String((req.body && req.body.rate_reason) || '').trim();
      const rateProvider = String((req.body && req.body.rate_provider) || '').trim();
      if (!jobId || !status) {
        res.status(400).json({ ok: false, error: 'job_id and status are required for kind=job-state' });
        return;
      }
      response = await syncJobStateToGas(jobId, status, rateNum, rateReason, rateProvider);
    } else {
      res.status(400).json({ ok: false, error: 'Unsupported sync kind' });
      return;
    }
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
