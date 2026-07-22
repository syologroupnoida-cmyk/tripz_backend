import { Router } from 'express';
import { requireVendorType } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as bookingController from '../../controllers/propertyBooking.controller.js';
import {
  listOwnerBookingsQuerySchema,
  noShowSchema,
} from '../../validators/propertyBooking.validator.js';

// Property owner bookings dashboard — only PROPERTY_OWNER vendors.
const router = Router();
router.use(requireVendorType('PROPERTY_OWNER'));

// GET /vendor/property-bookings — list all bookings across my properties
router.get('/',
  validateRequest(listOwnerBookingsQuerySchema, 'query'),
  bookingController.listOwnerBookings,
);

// GET /vendor/property-bookings/:id — detail
router.get('/:id', bookingController.getOwnerBookingDetail);

// PATCH /vendor/property-bookings/:id/check-in — mark guest arrived
router.patch('/:id/check-in', bookingController.markCheckIn);

// PATCH /vendor/property-bookings/:id/check-out — mark guest left (→ COMPLETED)
router.patch('/:id/check-out', bookingController.markCheckOut);

// PATCH /vendor/property-bookings/:id/no-show — guest didn't arrive
router.patch('/:id/no-show',
  validateRequest(noShowSchema),
  bookingController.markNoShow,
);

export default router;
