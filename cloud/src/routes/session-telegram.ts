import { Router } from 'express';
import { createFakeTelegramSession } from '../services/session';

const router = Router();

router.post('/session/telegram', async function(req, res, next) {
  try {
    const mode = String((req.body && req.body.mode) || 'fake').trim();
    if (mode !== 'fake') {
      res.status(400).json({ ok: false, error: 'Only fake mode is implemented locally' });
      return;
    }
    const response = await createFakeTelegramSession({
      user_id: String((req.body && req.body.user_id) || '').trim(),
      username: String((req.body && req.body.username) || '').trim(),
      first_name: String((req.body && req.body.first_name) || '').trim(),
      last_name: String((req.body && req.body.last_name) || '').trim()
    });
    res.json(Object.assign({ ok: true }, response));
  } catch (error) {
    next(error);
  }
});

export default router;
