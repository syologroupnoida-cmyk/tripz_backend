import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as vendorMgmtController from '../../controllers/vendorManagement.controller.js';
import {
  activateVendorSchema,
  deactivateVendorSchema,
  grantCreditsSchema,
  revokeCreditsSchema,
} from '../../validators/vendorManagement.validator.js';

// Vendor management — WRITE endpoints (SUPER_ADMIN only).
// Role gate already applied at routes/super-admin/index.js. Mounted under /vendors.

const router = Router();

// POST /api/v1/super-admin/vendors/:userId/activate
router.post(
  '/:userId/activate',
  validateRequest(activateVendorSchema),
  vendorMgmtController.activateVendor,
);

// POST /api/v1/super-admin/vendors/:userId/deactivate
router.post(
  '/:userId/deactivate',
  validateRequest(deactivateVendorSchema),
  vendorMgmtController.deactivateVendor,
);

// POST /api/v1/super-admin/vendors/:userId/credits/grant
router.post(
  '/:userId/credits/grant',
  validateRequest(grantCreditsSchema),
  vendorMgmtController.grantCredits,
);

// POST /api/v1/super-admin/vendors/:userId/credits/revoke
router.post(
  '/:userId/credits/revoke',
  validateRequest(revokeCreditsSchema),
  vendorMgmtController.revokeCredits,
);

export default router;
