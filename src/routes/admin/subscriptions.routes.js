import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as subscriptionController from '../../controllers/subscription.controller.js';
import { listSubscriptionsQuerySchema } from '../../validators/subscription.validator.js';

// Vendor subscriptions — READ-only monitoring for ADMIN + SUPER_ADMIN.
// Force-cancel lives under super-admin (power action — refunds, fraud
// clean-up, T&C violations). Role gate at routes/admin/index.js.
// Mounted under /subscriptions.

const router = Router();

// GET /api/v1/admin/subscriptions?status=ACTIVE&planId=...&vendorUserId=...
router.get(
  '/',
  validateRequest(listSubscriptionsQuerySchema, 'query'),
  subscriptionController.listAllSubscriptions,
);

// GET /api/v1/admin/subscriptions/:id
router.get('/:id', subscriptionController.getSubscriptionDetail);

export default router;
