import { Router } from 'express';

const router = Router();

router.get('/health', function(_req, res) {
  res.json({
    ok: true,
    service: 'hrscrape2mart-cloud'
  });
});

export default router;
