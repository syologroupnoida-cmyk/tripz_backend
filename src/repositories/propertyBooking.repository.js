import prisma from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

// Fields returned in booking responses. Includes property + room + minimal owner info.
const BOOKING_SELECT = {
  id: true,
  guestUserId: true,
  propertyId: true,
  roomId: true,
  guestName: true,
  guestPhone: true,
  guestEmail: true,
  numGuests: true,
  unitsBooked: true,
  checkIn: true,
  checkOut: true,
  nights: true,
  pricePerNightInPaise: true,
  totalAmountInPaise: true,
  status: true,
  paymentStatus: true,
  checkedInAt: true,
  checkedOutAt: true,
  cancelledAt: true,
  cancelledByUserId: true,
  cancellationReason: true,
  commissionInPaise: true,
  payoutAmountInPaise: true,
  payoutStatus: true,
  payoutReference: true,
  payoutAt: true,
  payoutNotes: true,
  specialRequests: true,
  createdAt: true,
  updatedAt: true,
  property: {
    select: {
      id: true, slug: true, title: true, propertyType: true,
      city: true, state: true, country: true, address: true,
      mainImage: true, contactPhone: true, contactEmail: true,
      ownerUserId: true,
    },
  },
  room: {
    select: {
      id: true, name: true, category: true,
      pricePerNightInPaise: true, maxGuests: true,
    },
  },
};

// Extended select for admin — attaches owner user info too.
const ADMIN_BOOKING_SELECT = {
  ...BOOKING_SELECT,
  property: {
    select: {
      id: true, slug: true, title: true, propertyType: true,
      city: true, state: true, country: true, address: true,
      mainImage: true, contactPhone: true, contactEmail: true,
      ownerUserId: true,
      owner: {
        select: {
          userId: true, vendorType: true, kycStatus: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
        },
      },
    },
  },
};

// ---- Availability primitive ----
// Sum of units already booked for a room over an overlapping window.
// Runs inside a transaction — see createBookingSafely.
export const countBookedUnitsForRoomTx = async (tx, { roomId, checkIn, checkOut }) => {
  const result = await tx.propertyBooking.aggregate({
    where: {
      roomId,
      status: { in: ['CONFIRMED', 'CHECKED_IN'] },
      checkOut: { gt: checkIn },
      checkIn:  { lt: checkOut },
    },
    _sum: { unitsBooked: true },
  });
  return result._sum.unitsBooked ?? 0;
};

// ---- Atomic booking creation with overbooking protection ----
// Two concurrent bookings for the same room could both pass a naive availability
// check and both succeed. Wrapping in a transaction with a fresh availability
// query INSIDE the transaction closes the race window.
//
// Note: this alone doesn't lock the row — under high concurrency you may want
// Serializable isolation or SELECT FOR UPDATE. For MVP volume this is enough.
export const createBookingSafely = async ({
  guestUserId, property, room,
  checkIn, checkOut, nights,
  numGuests, unitsBooked,
  guestName, guestPhone, guestEmail, specialRequests,
}) => {
  const pricePerNightInPaise = room.pricePerNightInPaise;
  const totalAmountInPaise = pricePerNightInPaise * nights * unitsBooked;

  return prisma.$transaction(async (tx) => {
    // Fresh availability check inside the transaction.
    const bookedUnits = await countBookedUnitsForRoomTx(tx, {
      roomId: room.id,
      checkIn,
      checkOut,
    });
    const availableUnits = room.totalUnits - bookedUnits;

    if (availableUnits < unitsBooked) {
      throw new ApiError(409, 'Not enough rooms available for the selected dates.', {
        code: 'INSUFFICIENT_AVAILABILITY',
        requested: unitsBooked,
        available: availableUnits,
      });
    }

    return tx.propertyBooking.create({
      data: {
        guestUserId,
        propertyId: property.id,
        roomId: room.id,
        guestName,
        guestPhone,
        guestEmail,
        numGuests,
        unitsBooked,
        checkIn,
        checkOut,
        nights,
        pricePerNightInPaise,
        totalAmountInPaise,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING', // No payment gateway yet — MVP
        specialRequests: specialRequests ?? null,
      },
      select: BOOKING_SELECT,
    });
  });
};

// ---- Booking lookups ----

export const getBookingById = async (id) => {
  return prisma.propertyBooking.findUnique({
    where: { id },
    select: BOOKING_SELECT,
  });
};

export const getBookingByIdForAdmin = async (id) => {
  return prisma.propertyBooking.findUnique({
    where: { id },
    select: ADMIN_BOOKING_SELECT,
  });
};

// ---- Status transitions ----
// updateMany with status guard = CAS transition (safe under concurrency).

export const transitionBookingStatus = async ({
  id, fromStatuses, toStatus, extra = {}, guardFields = {},
}) => {
  const result = await prisma.propertyBooking.updateMany({
    where: {
      id,
      status: { in: fromStatuses },
      ...guardFields,
    },
    data: { status: toStatus, ...extra },
  });
  return result.count === 1;
};

// ---- Payout recording (admin) ----

export const recordPayout = async ({
  id, commissionInPaise, payoutAmountInPaise, payoutReference, payoutNotes,
}) => {
  return prisma.propertyBooking.update({
    where: { id },
    data: {
      commissionInPaise,
      payoutAmountInPaise,
      payoutStatus: 'PAID',
      payoutReference,
      payoutAt: new Date(),
      payoutNotes: payoutNotes ?? null,
    },
    select: BOOKING_SELECT,
  });
};

// ---- List queries ----

// Guest — my bookings
export const listBookingsForGuest = async ({
  guestUserId, status, sortBy, order, take, skip,
}) => {
  const where = { guestUserId };
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.propertyBooking.findMany({
      where, orderBy: { [sortBy]: order }, take, skip,
      select: BOOKING_SELECT,
    }),
    prisma.propertyBooking.count({ where }),
  ]);
  return { items, total };
};

// Owner — all bookings across their properties
export const listBookingsForOwner = async ({
  ownerUserId, status, propertyId, fromDate, toDate, payoutStatus,
  sortBy, order, take, skip,
}) => {
  const where = {
    property: { ownerUserId, deletedAt: null },
  };
  if (status) where.status = status;
  if (propertyId) where.propertyId = propertyId;
  if (payoutStatus) where.payoutStatus = payoutStatus;
  if (fromDate || toDate) {
    where.checkIn = {};
    if (fromDate) where.checkIn.gte = fromDate;
    if (toDate) where.checkIn.lte = toDate;
  }

  const [items, total] = await Promise.all([
    prisma.propertyBooking.findMany({
      where, orderBy: { [sortBy]: order }, take, skip,
      select: BOOKING_SELECT,
    }),
    prisma.propertyBooking.count({ where }),
  ]);
  return { items, total };
};

// Admin — platform-wide
export const listBookingsForAdmin = async ({
  status, propertyId, ownerUserId, guestUserId,
  fromDate, toDate, payoutStatus, search,
  sortBy, order, take, skip,
}) => {
  const where = {};
  if (status) where.status = status;
  if (propertyId) where.propertyId = propertyId;
  if (guestUserId) where.guestUserId = guestUserId;
  if (payoutStatus) where.payoutStatus = payoutStatus;
  if (ownerUserId) {
    where.property = { ownerUserId };
  }
  if (fromDate || toDate) {
    where.checkIn = {};
    if (fromDate) where.checkIn.gte = fromDate;
    if (toDate) where.checkIn.lte = toDate;
  }
  if (search) {
    where.OR = [
      { guestName: { contains: search, mode: 'insensitive' } },
      { guestEmail: { contains: search, mode: 'insensitive' } },
      { guestPhone: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.propertyBooking.findMany({
      where, orderBy: { [sortBy]: order }, take, skip,
      select: ADMIN_BOOKING_SELECT,
    }),
    prisma.propertyBooking.count({ where }),
  ]);
  return { items, total };
};
