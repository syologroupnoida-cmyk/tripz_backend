import { Router } from 'express';
import { sendSuccess } from '../../utils/response.js';

const router = Router();

router.get('/ping', (req, res) =>
  sendSuccess(res, {
    message: 'Client panel reachable.',
    data: { user: req.user },
  }),
);

export default router;
