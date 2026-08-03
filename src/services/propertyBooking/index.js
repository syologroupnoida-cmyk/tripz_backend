import prisma from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import * as bookingRepo from '../../repositories/propertyBooking.repository.js';
import * as mail from '../mail/index.js';

// Fire-and-forget email helper — swallow errors so a mail failure never
// breaks the booking flow. Errors are logged for observability.
const sendEmailQuietly = (label, promise) => {
  Promise.resolve(promise).catch((err) => {
    console.error(`[booking-email] ${label} failed:`, err?.message ?? err);
  });
};

// ---- GUEST: create booking (multi-room support) ----
// Accepts data.items = [{ roomId, unitsBooked }, ...]. Backend resolves rooms,
// validates capacity + min-stay, then does atomic transaction with per-room
// availability checks. Any single room short → whole booking rolls back.
export const createBooking = async ({ guestUserId, data }) => {
  // 1. Fetch property — must exist, be APPROVED
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

  // 2. Fetch all requested rooms in one query
  const roomIds = data.items.map((i) => i.roomId);
  const rooms = await prisma.propertyRoom.findMany({
    where: { id: { in: roomIds }, propertyId: data.propertyId, isActive: true },
    select: {
      id: true, name: true, pricePerNightInPaise: true,
      maxGuests: true, totalUnits: true,
    },
  });

  // Verify every requested roomId was found (missing/inactive/wrong property)
  const foundRoomIds = new Set(rooms.map((r) => r.id));
  const missingIds = roomIds.filter((id) => !foundRoomIds.has(id));
  if (missingIds.length > 0) {
    throw ApiError.notFound(
      `One or more rooms not found or are inactive: ${missingIds.join(', ')}`,
    );
  }

  // 3. Resolve items — pair each item with its full room record
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const itemsResolved = data.items.map((i) => ({
    room: roomsById.get(i.roomId),
    unitsBooked: i.unitsBooked,
  }));

  // 4. Business rules
  // 4a. Total capacity across all items must accommodate all guests
  const totalCapacity = itemsResolved.reduce(
    (sum, { room, unitsBooked }) => sum + room.maxGuests * unitsBooked, 0,
  );
  if (data.numGuests > totalCapacity) {
    throw new ApiError(400,
      `Number of guests (${data.numGuests}) exceeds total capacity (${totalCapacity} across selected rooms).`,
      { code: 'GUEST_COUNT_EXCEEDS_CAPACITY', totalCapacity },
    );
  }

  // 4b. Minimum stay
  if (data.nights < property.minStayNights) {
    throw new ApiError(400,
      `Minimum stay is ${property.minStayNights} nights. Your booking is ${data.nights} nights.`,
      { code: 'MIN_STAY_NOT_MET', minStayNights: property.minStayNights },
    );
  }

  // 5. Atomic create with per-item availability check (inside DB transaction)
  const booking = await bookingRepo.createBookingSafely({
    guestUserId,
    property,
    itemsResolved,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    nights: data.nights,
    numGuests: data.numGuests,
    guestName: data.guestName,
    guestPhone: data.guestPhone,
    guestEmail: data.guestEmail,
    specialRequests: data.specialRequests,
  });

  // 6. Fire notifications (non-blocking)
  sendBookingCreatedNotifications(booking);

  return { booking, message: 'Booking confirmed.' };
};

// Flatten booking.items into a display-friendly summary for email templates.
//   [{ room: {name}, unitsBooked: 1 }, { room: {name}, unitsBooked: 2 }]
//   →  "AC Room × 1, Non-AC Room × 2"
const summarizeItems = (items) => items
  .map((i) => `${i.room?.name ?? 'Room'} × ${i.unitsBooked}`)
  .join(', ');

// Look up the owner's user record and send guest + owner emails in parallel.
// Runs after createBooking returns — errors logged, never propagated.
const sendBookingCreatedNotifications = async (booking) => {
  try {
    console.log('[booking-email] booking created — looking up owner', {
      bookingId: booking.id,
      ownerUserId: booking.property?.ownerUserId,
      guestEmail: booking.guestEmail,
    });

    const owner = await prisma.user.findUnique({
      where: { id: booking.property.ownerUserId },
      select: { firstName: true, email: true, isActive: true },
    });

    console.log('[booking-email] owner lookup result:', {
      found: Boolean(owner),
      hasEmail: Boolean(owner?.email),
      email: owner?.email,
    });

    const roomsSummary = summarizeItems(booking.items);
    const totalUnits = booking.items.reduce((s, i) => s + i.unitsBooked, 0);

    sendEmailQuietly('guest confirmation', mail.sendBookingConfirmationToGuest({
      to: booking.guestEmail,
      guestName: booking.guestName,
      bookingId: booking.id,
      propertyTitle: booking.property.title,
      propertyAddress: booking.property.address,
      propertyCity: booking.property.city,
      roomName: roomsSummary,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: booking.nights,
      numGuests: booking.numGuests,
      unitsBooked: totalUnits,
      totalAmountInPaise: booking.totalAmountInPaise,
      ownerContactPhone: booking.property.contactPhone,
      ownerContactEmail: booking.property.contactEmail,
    }));

    if (owner?.email) {
      console.log('[booking-email] dispatching owner email to', owner.email);
      sendEmailQuietly('owner new-booking', mail.sendNewBookingReceivedToOwner({
        to: owner.email,
        ownerName: owner.firstName,
        bookingId: booking.id,
        propertyTitle: booking.property.title,
        roomName: roomsSummary,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        numGuests: booking.numGuests,
        unitsBooked: totalUnits,
        totalAmountInPaise: booking.totalAmountInPaise,
        guestName: booking.guestName,
        guestPhone: booking.guestPhone,
        guestEmail: booking.guestEmail,
        specialRequests: booking.specialRequests,
      }));
    } else {
      console.warn('[booking-email] SKIPPED owner email — owner user or email missing', {
        ownerUserId: booking.property.ownerUserId,
        owner,
      });
    }
  } catch (err) {
    console.error('[booking-email] notification lookup failed:', err?.message ?? err);
  }
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

  // Fire cancellation emails to guest + owner (non-blocking)
  sendBookingCancelledNotifications(updated);

  return { booking: updated, message: 'Booking cancelled.' };
};

// Guest + owner cancellation emails. Fire-and-forget.
const sendBookingCancelledNotifications = async (booking) => {
  try {
    const owner = await prisma.user.findUnique({
      where: { id: booking.property.ownerUserId },
      select: { firstName: true, email: true },
    });

    sendEmailQuietly('guest cancellation', mail.sendBookingCancelledToGuest({
      to: booking.guestEmail,
      guestName: booking.guestName,
      bookingId: booking.id,
      propertyTitle: booking.property.title,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      cancellationReason: booking.cancellationReason,
    }));

    if (owner?.email) {
      sendEmailQuietly('owner cancellation', mail.sendBookingCancelledToOwner({
        to: owner.email,
        ownerName: owner.firstName,
        bookingId: booking.id,
        propertyTitle: booking.property.title,
        roomName: summarizeItems(booking.items),
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guestName: booking.guestName,
        cancellationReason: booking.cancellationReason,
      }));
    }
  } catch (err) {
    console.error('[booking-email] cancellation lookup failed:', err?.message ?? err);
  }
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
