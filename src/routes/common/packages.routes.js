import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as packageController from '../../controllers/package.controller.js';
import { publicPackagesQuerySchema } from '../../validators/package.validator.js';

// Public marketplace catalog. NO authentication — anyone browsing the site
// can see and detail-view APPROVED packages before signing up. Repository
// filters to APPROVED + non-deleted + active validity window (SEASONAL
// packages auto-hide when their endDate passes).
//
// Mounted under /packages by common/index.js.

const router = Router();

// GET /api/v1/packages?destination=Kashmir&packageType=FAMILY&validityType=SEASONAL
router.get(
  '/',
  validateRequest(publicPackagesQuerySchema, 'query'),
  packageController.listPackagesPublic,
);

// GET /api/v1/packages/:slug  — SEO-friendly detail URL
router.get('/:slug', packageController.getPackageBySlugPublic);

export default router;
