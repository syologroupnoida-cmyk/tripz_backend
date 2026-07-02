import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as subscriptionController from '../../controllers/subscription.controller.js';
import {
  buySubscriptionSchema,
  upgradeSubscriptionSchema,
  vendorSubscriptionHistoryQuerySchema,
} from '../../validators/subscription.validator.js';

// Vendor's own subscription actions. VENDOR role. Role gate at
// routes/vendor/index.js. Mounted under /subscriptions.
//
// Phase-1 direct-buy: no payment gateway. Razorpay verification step will
// slot in front of buy/upgrade once payments are wired.

const router = Router();

// POST /api/v1/vendor/subscriptions  { planId }
// Fresh purchase — 409 if vendor already has an ACTIVE sub.
router.post(
  '/',
  validateRequest(buySubscriptionSchema),
  subscriptionController.buySubscription,
);

// POST /api/v1/vendor/subscriptions/upgrade  { planId }
// Add-Days upgrade — old sub → UPGRADED, new sub gets bonus days from
// remaining old-plan value. Downgrade (cheaper plan) returns 400.
router.post(
  '/upgrade',
  validateRequest(upgradeSubscriptionSchema),
  subscriptionController.upgradeSubscription,
);

// GET /api/v1/vendor/subscriptions/current
// Current ACTIVE sub. Returns effectiveStatus=EXPIRED if past expiresAt
// (before the daily cron catches up).
router.get('/current', subscriptionController.getCurrentSubscription);

// GET /api/v1/vendor/subscriptions/history?page=0&size=20
router.get(
  '/history',
  validateRequest(vendorSubscriptionHistoryQuerySchema, 'query'),
  subscriptionController.getSubscriptionHistory,
);

export default router;
