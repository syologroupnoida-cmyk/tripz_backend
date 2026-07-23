import { Router } from 'express';
import { requireVendorType } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as propertyController from '../../controllers/property.controller.js';
import * as dashboardController from '../../controllers/propertyDashboard.controller.js';
import {
  createPropertySchema,
  updatePropertySchema,
  listMyPropertiesQuerySchema,
  createPropertyQuerySchema,
  updatePropertyQuerySchema,
  pausePropertyQuerySchema,
  roomInputSchema,
  roomUpdateSchema,
  inventorySummaryQuerySchema,
  calendarQuerySchema,
} from '../../validators/property.validator.js';

const router = Router();

// Every route here requires the vendor's business type = PROPERTY_OWNER.
// Travel agents accidentally hitting this endpoint get a clear 403.
router.use(requireVendorType('PROPERTY_OWNER'));

// ---- Property CRUD ----

// POST /vendor/properties?draft=true|false
router.post('/',
  validateRequest(createPropertyQuerySchema, 'query'),
  validateRequest(createPropertySchema),
  propertyController.createProperty,
);

// GET /vendor/properties?status=DRAFT&page=0&size=20
router.get('/',
  validateRequest(listMyPropertiesQuerySchema, 'query'),
  propertyController.listMyProperties,
);

// ---- Dashboard endpoints (must come BEFORE /:id to avoid path collision) ----

// GET /vendor/properties/dashboard/overview — aggregate stats across all my properties
router.get('/dashboard/overview', dashboardController.getOwnerOverview);

// GET /vendor/properties/:id
router.get('/:id', propertyController.getMyPropertyDetail);

// GET /vendor/properties/:id/inventory-summary?fromDate=&toDate=
router.get('/:id/inventory-summary',
  validateRequest(inventorySummaryQuerySchema, 'query'),
  dashboardController.getInventorySummary,
);

// GET /vendor/properties/:id/calendar?month=YYYY-MM
router.get('/:id/calendar',
  validateRequest(calendarQuerySchema, 'query'),
  dashboardController.getPropertyCalendar,
);

// PATCH /vendor/properties/:id?draft=true|false
router.patch('/:id',
  validateRequest(updatePropertyQuerySchema, 'query'),
  validateRequest(updatePropertySchema),
  propertyController.updateProperty,
);

// PATCH /vendor/properties/:id/pause?paused=true|false
router.patch('/:id/pause',
  validateRequest(pausePropertyQuerySchema, 'query'),
  propertyController.setPropertyPaused,
);

// DELETE /vendor/properties/:id (soft delete)
router.delete('/:id', propertyController.deleteProperty);

// ---- Rooms (nested under property) ----

// POST /vendor/properties/:id/rooms
router.post('/:id/rooms',
  validateRequest(roomInputSchema),
  propertyController.addRoom,
);

// PATCH /vendor/properties/:id/rooms/:roomId
router.patch('/:id/rooms/:roomId',
  validateRequest(roomUpdateSchema),
  propertyController.updateRoom,
);

// DELETE /vendor/properties/:id/rooms/:roomId
router.delete('/:id/rooms/:roomId', propertyController.deleteRoom);

export default router;
