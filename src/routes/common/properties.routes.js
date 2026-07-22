import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as propertyController from '../../controllers/property.controller.js';
import {
  publicPropertiesQuerySchema,
  availabilityCheckQuerySchema,
} from '../../validators/property.validator.js';

const router = Router();

// GET /api/v1/properties (public — browse marketplace)
// Server-side filters: only APPROVED, non-deleted properties.
router.get('/',
  validateRequest(publicPropertiesQuerySchema, 'query'),
  propertyController.listPropertiesPublic,
);

// GET /api/v1/properties/:slug/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=2
// Real-time availability check for a specific property.
// Frontend hits this before showing the booking form.
router.get('/:slug/availability',
  validateRequest(availabilityCheckQuerySchema, 'query'),
  propertyController.checkPropertyAvailability,
);

// GET /api/v1/properties/:slug (public detail by SEO slug)
// Optional query: ?checkIn=&checkOut=&guests= to embed availability in response.
router.get('/:slug', propertyController.getPropertyBySlugPublic);

export default router;
