import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as guideController from '../../controllers/travelGuide.controller.js';
import { publicTravelGuidesQuerySchema } from '../../validators/travelGuide.validator.js';

const router = Router();

// GET /api/v1/travel-guide (public — no auth)
router.get('/',
  validateRequest(publicTravelGuidesQuerySchema, 'query'),
  guideController.listGuidesPublic
);

// GET /api/v1/travel-guide/:slug (public detail by SEO slug)
router.get('/:slug', guideController.getGuideBySlugPublic);

export default router;
