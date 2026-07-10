import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as guideController from '../../controllers/travelGuide.controller.js';
import {
  createTravelGuideSchema,
  updateTravelGuideSchema,
  listVendorTravelGuidesQuerySchema,
} from '../../validators/travelGuide.validator.js';

const router = Router();

// POST /api/v1/vendor/travel-guide
router.post('/', validateRequest(createTravelGuideSchema), guideController.createTravelGuide);

// GET /api/v1/vendor/travel-guide?page=0&size=20
router.get('/',
  validateRequest(listVendorTravelGuidesQuerySchema, 'query'),
  guideController.listMyTravelGuides
);

// GET /api/v1/vendor/travel-guide/:id
router.get('/:id', guideController.getMyGuideDetail);

// PATCH /api/v1/vendor/travel-guide/:id
router.patch('/:id', validateRequest(updateTravelGuideSchema), guideController.updateTravelGuide);

// DELETE /api/v1/vendor/travel-guide/:id (soft delete)
router.delete('/:id', guideController.deleteTravelGuide);

export default router;
