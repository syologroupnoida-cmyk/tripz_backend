import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as subscriptionController from '../../controllers/subscription.controller.js';
import { cancelSubscriptionSchema } from '../../validators/subscription.validator.js';

// Vendor subscription — power actions. SUPER_ADMIN only.
//
// Force-cancel is used for: refund flows, fraud clean-up, T&C violations,
// or vendor support requests. It stays here (not admin) to match the
// existing pattern where credit grants/revokes and vendor activate/
// deactivate also live under super-admin.
//
// Role gate applied at routes/super-admin/index.js. Mounted under /subscriptions.

const router = Router();

// POST /api/v1/super-admin/subscriptions/:id/cancel   (reason required)
router.post(
  '/:id/cancel',
  validateRequest(cancelSubscriptionSchema),
  subscriptionController.cancelSubscription,
);

export default router;
