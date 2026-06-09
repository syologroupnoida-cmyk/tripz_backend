import { Router } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { createAdminSchema } from '../../validators/auth.validator.js';
import * as superAdminController from '../../controllers/superAdmin.controller.js';

const router = Router();

router.get('/ping', (req, res) =>
  sendSuccess(res, {
    message: 'Super Admin panel reachable.',
    data: { user: req.user },
  }),
);

router.post(
  '/admins',
  validateRequest(createAdminSchema),
  superAdminController.createAdmin,
);

export default router;
