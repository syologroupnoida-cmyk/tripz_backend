import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as packageController from '../../controllers/package.controller.js';
import {
  listAdminPackagesQuerySchema,
  rejectPackageSchema,
} from '../../validators/package.validator.js';

// Vendor packages — admin moderation queue + approve/reject actions.
// ADMIN + SUPER_ADMIN. Role gate at routes/admin/index.js. Mounted under /packages.

const router = Router();

// GET /api/v1/admin/packages?status=SUBMITTED&departureCity=Delhi&hasPendingReview=true
router.get(
  '/',
  validateRequest(listAdminPackagesQuerySchema, 'query'),
  packageController.listPackagesForAdmin,
);

// GET /api/v1/admin/packages/:id — full detail incl. vendor user info
router.get('/:id', packageController.getPackageDetailForAdmin);

// POST /api/v1/admin/packages/:id/approve
// SUBMITTED → APPROVED. Clears hasPendingReview.
router.post('/:id/approve', packageController.approvePackage);

// POST /api/v1/admin/packages/:id/reject   (reason required)
// SUBMITTED → REJECTED. Vendor can edit + resubmit.
router.post(
  '/:id/reject',
  validateRequest(rejectPackageSchema),
  packageController.rejectPackage,
);

export default router;
