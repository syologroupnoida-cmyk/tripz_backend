import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as bookingController from '../../controllers/propertyBooking.controller.js';
import {
  listAdminBookingsQuerySchema,
  recordPayoutSchema,
} from '../../validators/propertyBooking.validator.js';

// Platform-wide booking oversight + manual payout tracking.
// ADMIN + SUPER_ADMIN — role gate at routes/admin/index.js.
const router = Router();

// GET /admin/property-bookings — all bookings with filters
router.get('/',
  validateRequest(listAdminBookingsQuerySchema, 'query'),
  bookingController.listAdminBookings,
);

// GET /admin/property-bookings/:id — full detail with owner + property info
router.get('/:id', bookingController.getAdminBookingDetail);

// POST /admin/property-bookings/:id/payout
// Admin enters commission + bank transfer reference after offline settlement.
// Only COMPLETED bookings can be paid out. Idempotent — errors if already paid.
router.post('/:id/payout',
  validateRequest(recordPayoutSchema),
  bookingController.recordBookingPayout,
);

export default router;
