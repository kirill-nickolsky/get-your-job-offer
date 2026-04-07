import { Router } from 'express';
import { requireTaskAuth } from '../auth';
import { syncSourceConfigsFromGas } from '../services/gas';

const router = Router();

router.post('/internal/sync-source-configs', requireTaskAuth, async function(_req, res, next) {
  try {
    const response = await syncSourceConfigsFromGas();
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
