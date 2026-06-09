import { Router } from 'express';
import { sendSuccess } from '../../utils/response.js';

const router = Router();

router.get('/', (_req, res) => {
  return sendSuccess(res, {
    message: 'Tripz API is healthy.',
    data: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
