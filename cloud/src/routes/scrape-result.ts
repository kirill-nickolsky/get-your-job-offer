import { Router } from 'express';
import { requireAddonAuth } from '../auth';
import { ingestScrapeResult } from '../services/ingest';

const router = Router();

router.post('/scrape-result', requireAddonAuth, async function(req, res, next) {
  try {
    const response = await ingestScrapeResult(req.body || {});
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
