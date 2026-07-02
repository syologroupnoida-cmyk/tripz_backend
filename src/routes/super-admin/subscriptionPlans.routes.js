import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as subscriptionController from '../../controllers/subscription.controller.js';
import {
  createPlanSchema,
  updatePlanSchema,
  deletePlanSchema,
} from '../../validators/subscription.validator.js';

// Subscription plan catalog — write endpoints. SUPER_ADMIN only.
// Role gate is applied at routes/super-admin/index.js. Mounted under
// /subscription-plans.

const router = Router();

// POST /api/v1/super-admin/subscription-plans
router.post(
  '/',
  validateRequest(createPlanSchema),
  subscriptionController.createPlan,
);

// PATCH /api/v1/super-admin/subscription-plans/:id
// Handles field edits AND active-flag toggling — pass `isActive: false` to
// deactivate (reversible hide), `isActive: true` to reactivate. Fails with
// 400 PLAN_DELETED if the target is soft-deleted.
router.patch(
  '/:id',
  validateRequest(updatePlanSchema),
  subscriptionController.updatePlan,
);

// DELETE /api/v1/super-admin/subscription-plans/:id
// Soft delete — plan is retired forever. Existing vendor subs untouched.
// Optional `reason` in body for audit log. Idempotent.
router.delete(
  '/:id',
  validateRequest(deletePlanSchema),
  subscriptionController.deletePlan,
);

export default router;
