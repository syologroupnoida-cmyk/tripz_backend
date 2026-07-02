import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as vendorLeadsController from '../../controllers/vendorLeads.controller.js';
import {
  listUnlockedLeadsQuerySchema,
  listDirectLeadsQuerySchema,
} from '../../validators/vendorLeads.validator.js';

// Vendor's own lead views (purchase history + direct inbox). Role gate (VENDOR)
// is applied at routes/vendor/index.js. Mounted under /leads.

const router = Router();

// GET /api/v1/vendor/leads/unlocked?page=0&size=20
// Paginated list of leads this vendor has unlocked.
router.get(
  '/unlocked',
  validateRequest(listUnlockedLeadsQuerySchema, 'query'),
  vendorLeadsController.listMyUnlockedLeads,
);

// GET /api/v1/vendor/leads/unlocked/:assignmentId
// Re-view a single unlocked lead (with full contact info).
router.get('/unlocked/:assignmentId', vendorLeadsController.getMyUnlockedLead);

// GET /api/v1/vendor/leads/direct?page=0&size=20
// Direct-lead inbox: ACTIVE leads where targetVendorId == this vendor and
// not yet unlocked. Contact info is masked; vendor must unlock to reveal.
router.get(
  '/direct',
  validateRequest(listDirectLeadsQuerySchema, 'query'),
  vendorLeadsController.listMyDirectLeads,
);

export default router;
