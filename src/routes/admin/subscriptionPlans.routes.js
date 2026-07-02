import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as subscriptionController from '../../controllers/subscription.controller.js';
import { listPlansQuerySchema } from '../../validators/subscription.validator.js';

// Subscription plan catalog — READ endpoints. ADMIN + SUPER_ADMIN.
// Role gate at routes/admin/index.js. Mounted under /subscription-plans.

const router = Router();

// GET /api/v1/admin/subscription-plans?isActive=true&page=0&size=20
router.get(
  '/',
  validateRequest(listPlansQuerySchema, 'query'),
  subscriptionController.listPlansForAdmin,
);

// GET /api/v1/admin/subscription-plans/:id
router.get('/:id', subscriptionController.getPlanDetail);

export default router;
