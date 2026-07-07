import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as packageController from '../../controllers/package.controller.js';
import {
  createPackageSchema,
  createDraftPackageSchema,
  createPackageQuerySchema,
  updatePackageSchema,
  listVendorPackagesQuerySchema,
  togglePausePackageQuerySchema,
} from '../../validators/package.validator.js';

// Route middleware that picks the create-schema based on the `?draft` flag.
// Must run AFTER `validateRequest(createPackageQuerySchema, 'query')` so that
// `req.query.asDraft` is already normalised.
//
//   asDraft === true  → lenient createDraftPackageSchema (only title required)
//   asDraft === false → strict createPackageSchema (all required fields)
const validateCreateBody = (req, res, next) => {
  const schema = req.query.asDraft === false ? createPackageSchema : createDraftPackageSchema;
  return validateRequest(schema)(req, res, next);
};

// Vendor package management. VENDOR role. Role gate at routes/vendor/index.js.
// Mounted under /packages.
//
// State machine transitions live in the service; endpoints here are the
// action verbs vendors use from their dashboard.

const router = Router();

// POST /api/v1/vendor/packages?draft=true|false
// Create a package. Default `?draft=true` → status DRAFT (only `title` required
// in the body, everything else can be filled later). Pass `?draft=false` to
// publish straight to admin review — the strict schema fires, so all required
// fields must be present. Image URLs must already be uploaded via /uploads/image.
router.post(
  '/',
  validateRequest(createPackageQuerySchema, 'query'),
  validateCreateBody,
  packageController.createPackage,
);

// GET /api/v1/vendor/packages?status=DRAFT&page=0&size=20
// Vendor's own package list.
router.get(
  '/',
  validateRequest(listVendorPackagesQuerySchema, 'query'),
  packageController.listMyPackages,
);

// GET /api/v1/vendor/packages/:id
router.get('/:id', packageController.getMyPackageDetail);

// PATCH /api/v1/vendor/packages/:id
// Update fields. Blocked while status is SUBMITTED (409 PACKAGE_UNDER_REVIEW).
// Editing an APPROVED/PAUSED package flags hasPendingReview.
router.patch(
  '/:id',
  validateRequest(updatePackageSchema),
  packageController.updatePackage,
);

// POST /api/v1/vendor/packages/:id/submit
// DRAFT or REJECTED → SUBMITTED. Clears prior review notes.
router.post('/:id/submit', packageController.submitPackage);

// PATCH /api/v1/vendor/packages/:id/pause?paused=true|false
// Unified visibility toggle:
//   ?paused=true  (default) → APPROVED → PAUSED  (hides from marketplace)
//   ?paused=false           → PAUSED   → APPROVED (back on marketplace, no re-review)
router.patch(
  '/:id/pause',
  validateRequest(togglePausePackageQuerySchema, 'query'),
  packageController.togglePausePackage,
);

// DELETE /api/v1/vendor/packages/:id
// Soft delete — stamps deletedAt. Idempotent-ish (returns 409 if already deleted).
router.delete('/:id', packageController.deletePackage);

export default router;
