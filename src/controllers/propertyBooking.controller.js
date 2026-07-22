import * as bookingService from '../services/propertyBooking/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ---- GUEST (CLIENT role) ----
export const createBooking = asyncHandler(async (req, res) => {
  const data = await bookingService.createBooking({
    guestUserId: req.user.id,
    data: req.body,
  });
  return sendSuccess(res, { statusCode: 201, message: data.message, data: data.booking });
});

export const listMyBookings = asyncHandler(async (req, res) => {
  const data = await bookingService.listMyBookings({
    ...req.query,
    guestUserId: req.user.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Bookings retrieved.', data });
});

export const getMyBookingDetail = asyncHandler(async (req, res) => {
  const data = await bookingService.getMyBookingDetail({
    guestUserId: req.user.id,
    bookingId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Booking retrieved.', data });
});

export const cancelMyBooking = asyncHandler(async (req, res) => {
  const data = await bookingService.cancelMyBooking({
    guestUserId: req.user.id,
    bookingId: req.params.id,
    reason: req.body?.reason,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.booking });
});

// ---- OWNER (VENDOR role, vendorType PROPERTY_OWNER) ----
export const listOwnerBookings = asyncHandler(async (req, res) => {
  const data = await bookingService.listBookingsForOwner({
    ...req.query,
    ownerUserId: req.user.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Bookings retrieved.', data });
});

export const getOwnerBookingDetail = asyncHandler(async (req, res) => {
  const data = await bookingService.getOwnerBookingDetail({
    ownerUserId: req.user.id,
    bookingId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Booking retrieved.', data });
});

export const markCheckIn = asyncHandler(async (req, res) => {
  const data = await bookingService.markCheckIn({
    ownerUserId: req.user.id,
    bookingId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.booking });
});

export const markCheckOut = asyncHandler(async (req, res) => {
  const data = await bookingService.markCheckOut({
    ownerUserId: req.user.id,
    bookingId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.booking });
});

export const markNoShow = asyncHandler(async (req, res) => {
  const data = await bookingService.markNoShow({
    ownerUserId: req.user.id,
    bookingId: req.params.id,
    notes: req.body?.notes,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.booking });
});

// ---- ADMIN ----
export const listAdminBookings = asyncHandler(async (req, res) => {
  const data = await bookingService.listBookingsForAdmin(req.query);
  return sendSuccess(res, { statusCode: 200, message: 'Bookings retrieved.', data });
});

export const getAdminBookingDetail = asyncHandler(async (req, res) => {
  const data = await bookingService.getAdminBookingDetail({
    bookingId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Booking retrieved.', data });
});

export const recordBookingPayout = asyncHandler(async (req, res) => {
  const data = await bookingService.recordBookingPayout({
    bookingId: req.params.id,
    commissionInPaise: req.body.commission,      // Rupees→paise done by validator
    payoutReference: req.body.payoutReference,
    payoutNotes: req.body.payoutNotes,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.booking });
});
