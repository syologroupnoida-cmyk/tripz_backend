import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as packageController from '../../controllers/package.controller.js';
import { publicPackagesQuerySchema } from '../../validators/package.validator.js';

// Public marketplace catalog. NO authentication — anyone browsing the site
// can see and detail-view APPROVED packages before signing up. Repository
// filters to APPROVED + non-deleted. SEASONAL packages can be browsed before
// their startDate and auto-hide only when their endDate passes.
//
// Mounted under /packages by common/index.js.

const router = Router();

// GET /api/v1/packages?departureCity=Delhi&destination=Kashmir&packageType=FAMILY
router.get(
  '/',
  validateRequest(publicPackagesQuerySchema, 'query'),
  packageController.listPackagesPublic,
);

// GET /api/v1/packages/:slug  — SEO-friendly detail URL
router.get('/:slug', packageController.getPackageBySlugPublic);

export default router;
