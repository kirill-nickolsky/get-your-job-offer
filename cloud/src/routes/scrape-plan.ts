import { Router } from 'express';
import { requireAddonAuth } from '../auth';
import { claimScrapePlan } from '../services/planner';

const router = Router();

router.post('/scrape-plan', requireAddonAuth, async function(req, res, next) {
  try {
    const response = await claimScrapePlan(req.body || {});
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
