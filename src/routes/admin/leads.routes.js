import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as adminLeadController from '../../controllers/adminLead.controller.js';
import {
  listLeadsQuerySchema,
  updateLeadStatusSchema,
  updateLeadPricingSchema,
} from '../../validators/adminLead.validator.js';

// Admin lead management. Role gate (ADMIN + SUPER_ADMIN) is applied at
// routes/admin/index.js. Mounted under /leads.

const router = Router();

// GET /api/v1/admin/leads?status=PENDING_REVIEW&page=0&size=20&...
router.get(
  '/',
  validateRequest(listLeadsQuerySchema, 'query'),
  adminLeadController.listLeads,
);

// GET /api/v1/admin/leads/:id
router.get('/:id', adminLeadController.getLeadDetail);

// PATCH /api/v1/admin/leads/:id/status
// One endpoint for all three state transitions:
//   { "status": "ACTIVE"   }              → approve (PENDING_REVIEW → ACTIVE)
//   { "status": "REJECTED", "reason": "..." } → reject (PENDING_REVIEW → REJECTED)
//   { "status": "CLOSED",  "reason"?: "..." } → close  (ACTIVE → CLOSED)
//
// On approve, optional pricing overrides may be sent in the same body:
//   { "status": "ACTIVE", "priceInCredits": 25, "maxUnlocks": 5 }
router.patch(
  '/:id/status',
  validateRequest(updateLeadStatusSchema),
  adminLeadController.updateLeadStatus,
);

// PATCH /api/v1/admin/leads/:id/pricing
// Adjust priceInCredits / maxUnlocks on an existing lead.
// Allowed only while no vendor has unlocked yet (`unlockCount === 0`)
// and the lead is in PENDING_REVIEW or ACTIVE state.
router.patch(
  '/:id/pricing',
  validateRequest(updateLeadPricingSchema),
  adminLeadController.updateLeadPricing,
);

export default router;
