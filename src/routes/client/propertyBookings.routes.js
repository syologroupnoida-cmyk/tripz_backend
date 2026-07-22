import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as bookingController from '../../controllers/propertyBooking.controller.js';
import {
  createBookingSchema,
  cancelBookingSchema,
  listMyBookingsQuerySchema,
} from '../../validators/propertyBooking.validator.js';

// CLIENT-scoped booking routes. Role gate at routes/client/index.js.
// Mounted at /client/property-bookings.
const router = Router();

// POST /api/v1/client/property-bookings — create booking
router.post('/',
  validateRequest(createBookingSchema),
  bookingController.createBooking,
);

// GET /api/v1/client/property-bookings — my bookings
router.get('/',
  validateRequest(listMyBookingsQuerySchema, 'query'),
  bookingController.listMyBookings,
);

// GET /api/v1/client/property-bookings/:id — my booking detail
router.get('/:id', bookingController.getMyBookingDetail);

// PATCH /api/v1/client/property-bookings/:id/cancel — cancel my booking
router.patch('/:id/cancel',
  validateRequest(cancelBookingSchema),
  bookingController.cancelMyBooking,
);

export default router;
