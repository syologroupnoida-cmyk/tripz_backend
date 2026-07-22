import prisma from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import * as bookingRepo from '../../repositories/propertyBooking.repository.js';

// ---- GUEST: create booking ----
export const createBooking = async ({ guestUserId, data }) => {
  // 1. Fetch property + room together — validate both exist, are active/approved
  const property = await prisma.property.findFirst({
    where: { id: data.propertyId, deletedAt: null, status: 'APPROVED' },
    select: {
      id: true, ownerUserId: true, minStayNights: true,
      title: true, propertyType: true,
    },
  });
  if (!property) {
    throw ApiError.notFound('Property not found or not available for booking.');
  }

  const room = await prisma.propertyRoom.findFirst({
    where: { id: data.roomId, propertyId: data.propertyId, isActive: true },
    select: {
      id: true, name: true, pricePerNightInPaise: true,
      maxGuests: true, totalUnits: true,
    },
  });
  if (!room) {
    throw ApiError.notFound('Room not found or is inactive.');
  }

  // 2. Business rules
  const totalCapacity = room.maxGuests * data.unitsBooked;
  if (data.numGuests > totalCapacity) {
    throw new ApiError(400,
      `Number of guests (${data.numGuests}) exceeds capacity ` +
      `(${room.maxGuests} per room × ${data.unitsBooked} rooms = ${totalCapacity}).`,
      { code: 'GUEST_COUNT_EXCEEDS_CAPACITY' },
    );
  }

  if (data.nights < property.minStayNights) {
    throw new ApiError(400,
      `Minimum stay is ${property.minStayNights} nights. Your booking is ${data.nights} nights.`,
      { code: 'MIN_STAY_NOT_MET', minStayNights: property.minStayNights },
    );
  }

  // 3. Atomic create with overbooking protection (inside DB transaction)
  const booking = await bookingRepo.createBookingSafely({
    guestUserId,
    property,
    room,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    nights: data.nights,
    numGuests: data.numGuests,
    unitsBooked: data.unitsBooked,
    guestName: data.guestName,
    guestPhone: data.guestPhone,
    guestEmail: data.guestEmail,
    specialRequests: data.specialRequests,
  });

  return { booking, message: 'Booking confirmed.' };
};

// ---- GUEST: list my bookings ----
export const listMyBookings = async (query) => {
  const { items, total } = await bookingRepo.listBookingsForGuest(query);
  return { items, total, take: query.take, skip: query.skip };
};

// ---- GUEST: my booking detail ----
export const getMyBookingDetail = async ({ guestUserId, bookingId }) => {
  const booking = await bookingRepo.getBookingById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');
  if (booking.guestUserId !== guestUserId) {
    throw new ApiError(403, 'You can only view your own bookings.');
  }
  return booking;
};

// ---- GUEST: cancel own booking ----
// Rules (MVP — free cancellation, no policy tiers yet):
//   - Only CONFIRMED bookings can be cancelled by guest
//   - CHECKED_IN / CHECKED_OUT / COMPLETED cannot be cancelled
//   - Inventory releases automatically (query filter excludes CANCELLED)
export const cancelMyBooking = async ({ guestUserId, bookingId, reason }) => {
  const booking = await bookingRepo.getBookingById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');
  if (booking.guestUserId !== guestUserId) {
    throw new ApiError(403, 'You can only cancel your own bookings.');
  }
  if (booking.status !== 'CONFIRMED') {
    throw new ApiError(409, `Only CONFIRMED bookings can be cancelled. Current status: ${booking.status}.`, {
      code: 'INVALID_TRANSITION',
      currentStatus: booking.status,
    });
  }

  const ok = await bookingRepo.transitionBookingStatus({
    id: bookingId,
    fromStatuses: ['CONFIRMED'],
    toStatus: 'CANCELLED',
    extra: {
      cancelledAt: new Date(),
      cancelledByUserId: guestUserId,
      cancellationReason: reason ?? null,
    },
  });
  if (!ok) throw new ApiError(500, 'Failed to cancel booking.');

  const updated = await bookingRepo.getBookingById(bookingId);
  return { booking: updated, message: 'Booking cancelled.' };
};

// ---- OWNER: list bookings across my properties ----
export const listBookingsForOwner = async (query) => {
  const { items, total } = await bookingRepo.listBookingsForOwner(query);
  return { items, total, take: query.take, skip: query.skip };
};

// ---- OWNER: booking detail (only for own properties) ----
export const getOwnerBookingDetail = async ({ ownerUserId, bookingId }) => {
  const booking = await bookingRepo.getBookingById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');
  if (booking.property.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only view bookings for your own properties.');
  }
  return booking;
};

// ---- OWNER: mark check-in ----
export const markCheckIn = async ({ ownerUserId, bookingId }) => {
  const booking = await bookingRepo.getBookingById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');
  if (booking.property.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only manage bookings for your own properties.');
  }
  if (booking.status !== 'CONFIRMED') {
    throw new ApiError(409, `Only CONFIRMED bookings can be checked in. Current status: ${booking.status}.`, {
      code: 'INVALID_TRANSITION',
      currentStatus: booking.status,
    });
  }

  const ok = await bookingRepo.transitionBookingStatus({
    id: bookingId,
    fromStatuses: ['CONFIRMED'],
    toStatus: 'CHECKED_IN',
    extra: { checkedInAt: new Date() },
  });
  if (!ok) throw new ApiError(500, 'Failed to mark check-in.');

  const updated = await bookingRepo.getBookingById(bookingId);
  return { booking: updated, message: 'Guest checked in.' };
};

// ---- OWNER: mark check-out ----
// Transitions to CHECKED_OUT immediately; a later cron/admin can flip to
// COMPLETED after the payout buffer window.
export const markCheckOut = async ({ ownerUserId, bookingId }) => {
  const booking = await bookingRepo.getBookingById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');
  if (booking.property.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only manage bookings for your own properties.');
  }
  if (booking.status !== 'CHECKED_IN') {
    throw new ApiError(409, `Only CHECKED_IN bookings can be checked out. Current status: ${booking.status}.`, {
      code: 'INVALID_TRANSITION',
      currentStatus: booking.status,
    });
  }

  const now = new Date();
  const ok = await bookingRepo.transitionBookingStatus({
    id: bookingId,
    fromStatuses: ['CHECKED_IN'],
    toStatus: 'COMPLETED', // Direct to COMPLETED; owner marks after guest leaves
    extra: { checkedOutAt: now },
  });
  if (!ok) throw new ApiError(500, 'Failed to mark check-out.');

  const updated = await bookingRepo.getBookingById(bookingId);
  return { booking: updated, message: 'Guest checked out. Booking completed.' };
};

// ---- OWNER: mark no-show ----
// After check-in date passes without guest arrival, owner marks NO_SHOW.
// Inventory has already been consumed for those dates — this is a record only.
export const markNoShow = async ({ ownerUserId, bookingId, notes }) => {
  const booking = await bookingRepo.getBookingById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');
  if (booking.property.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only manage bookings for your own properties.');
  }
  if (booking.status !== 'CONFIRMED') {
    throw new ApiError(409, `Only CONFIRMED bookings can be marked no-show. Current status: ${booking.status}.`, {
      code: 'INVALID_TRANSITION',
      currentStatus: booking.status,
    });
  }

  const ok = await bookingRepo.transitionBookingStatus({
    id: bookingId,
    fromStatuses: ['CONFIRMED'],
    toStatus: 'NO_SHOW',
    extra: {
      cancelledAt: new Date(),
      cancelledByUserId: ownerUserId,
      cancellationReason: notes ?? 'Marked no-show by property owner',
    },
  });
  if (!ok) throw new ApiError(500, 'Failed to mark no-show.');

  const updated = await bookingRepo.getBookingById(bookingId);
  return { booking: updated, message: 'Booking marked as no-show.' };
};

// ---- ADMIN: list all bookings ----
export const listBookingsForAdmin = async (query) => {
  const { items, total } = await bookingRepo.listBookingsForAdmin(query);
  return { items, total, take: query.take, skip: query.skip };
};

// ---- ADMIN: booking detail ----
export const getAdminBookingDetail = async ({ bookingId }) => {
  const booking = await bookingRepo.getBookingByIdForAdmin(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');
  return booking;
};

// ---- ADMIN: record commission + payout to owner ----
// Called after admin negotiates commission with owner over call, does the
// bank transfer offline, and returns to enter the reference number.
export const recordBookingPayout = async ({
  bookingId, commissionInPaise, payoutReference, payoutNotes,
}) => {
  const booking = await bookingRepo.getBookingById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');

  // Only COMPLETED bookings should be paid out
  if (booking.status !== 'COMPLETED') {
    throw new ApiError(409, `Only COMPLETED bookings can be paid out. Current status: ${booking.status}.`, {
      code: 'INVALID_PAYOUT_STATE',
      currentStatus: booking.status,
    });
  }
  if (booking.payoutStatus === 'PAID') {
    throw new ApiError(409, 'This booking has already been paid out.', {
      code: 'ALREADY_PAID_OUT',
      payoutAt: booking.payoutAt,
      payoutReference: booking.payoutReference,
    });
  }
  if (commissionInPaise > booking.totalAmountInPaise) {
    throw new ApiError(400, 'Commission cannot exceed the booking total.', {
      code: 'INVALID_COMMISSION',
      commission: commissionInPaise,
      totalAmount: booking.totalAmountInPaise,
    });
  }

  const payoutAmountInPaise = booking.totalAmountInPaise - commissionInPaise;
  const updated = await bookingRepo.recordPayout({
    id: bookingId,
    commissionInPaise,
    payoutAmountInPaise,
    payoutReference,
    payoutNotes,
  });

  return { booking: updated, message: 'Payout recorded.' };
};
