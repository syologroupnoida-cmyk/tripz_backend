import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as propertyController from '../../controllers/property.controller.js';
import {
  listAdminPropertiesQuerySchema,
  rejectPropertySchema,
} from '../../validators/property.validator.js';

// Property moderation queue + approve/reject actions.
// ADMIN + SUPER_ADMIN — role gate at routes/admin/index.js. Mounted under /properties.
const router = Router();

// GET /api/v1/admin/properties?status=SUBMITTED&hasPendingReview=true
router.get('/',
  validateRequest(listAdminPropertiesQuerySchema, 'query'),
  propertyController.listPropertiesForAdmin,
);

// GET /api/v1/admin/properties/:id — full detail with owner + KYC info
router.get('/:id', propertyController.getPropertyDetailForAdmin);

// POST /api/v1/admin/properties/:id/approve
// SUBMITTED → APPROVED. Clears hasPendingReview.
router.post('/:id/approve', propertyController.approveProperty);

// POST /api/v1/admin/properties/:id/reject   (reason required)
// SUBMITTED → REJECTED (vendor can fix + resubmit)
// APPROVED/PAUSED → REJECTED (post-approval take-down)
router.post('/:id/reject',
  validateRequest(rejectPropertySchema),
  propertyController.rejectProperty,
);

export default router;
