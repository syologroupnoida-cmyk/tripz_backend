import prisma from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

// Fields returned in booking responses. Includes property + items (each with
// its own room details) + minimal owner info.
const BOOKING_SELECT = {
  id: true,
  guestUserId: true,
  propertyId: true,
  guestName: true,
  guestPhone: true,
  guestEmail: true,
  numGuests: true,
  checkIn: true,
  checkOut: true,
  nights: true,
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
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      roomId: true,
      unitsBooked: true,
      pricePerNightInPaise: true,
      subtotalInPaise: true,
      room: {
        select: {
          id: true, name: true, category: true,
          pricePerNightInPaise: true, maxGuests: true, totalUnits: true,
        },
      },
    },
  },
};

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
// Aggregates ACROSS PropertyBookingItem — a booking may have multiple items,
// we only count those matching the requested room.
export const countBookedUnitsForRoomTx = async (tx, { roomId, checkIn, checkOut }) => {
  const result = await tx.propertyBookingItem.aggregate({
    where: {
      roomId,
      booking: {
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        checkOut: { gt: checkIn },
        checkIn:  { lt: checkOut },
      },
    },
    _sum: { unitsBooked: true },
  });
  return result._sum.unitsBooked ?? 0;
};

// Non-transaction version for public availability check + dashboard queries.
export const countBookedUnitsForRoom = async ({ roomId, checkIn, checkOut }) =>
  countBookedUnitsForRoomTx(prisma, { roomId, checkIn, checkOut });

// ---- Atomic multi-room booking creation ----
// Given a property + array of { room, unitsBooked }, checks EACH room's
// availability inside a single transaction, then creates the booking + all
// items atomically. Any single room short → whole booking rolls back.
export const createBookingSafely = async ({
  guestUserId, property,
  itemsResolved, // [{ room, unitsBooked }]
  checkIn, checkOut, nights,
  numGuests,
  guestName, guestPhone, guestEmail, specialRequests,
}) => {
  return prisma.$transaction(async (tx) => {
    // 1. Availability check for every requested room
    for (const { room, unitsBooked } of itemsResolved) {
      const bookedUnits = await countBookedUnitsForRoomTx(tx, {
        roomId: room.id,
        checkIn,
        checkOut,
      });
      const available = room.totalUnits - bookedUnits;
      if (available < unitsBooked) {
        throw new ApiError(409, `Not enough rooms available for "${room.name}".`, {
          code: 'INSUFFICIENT_AVAILABILITY',
          roomId: room.id,
          roomName: room.name,
          requested: unitsBooked,
          available,
        });
      }
    }

    // 2. Compute totals + build items payload
    const itemsToCreate = itemsResolved.map(({ room, unitsBooked }) => ({
      roomId: room.id,
      unitsBooked,
      pricePerNightInPaise: room.pricePerNightInPaise,
      subtotalInPaise: room.pricePerNightInPaise * nights * unitsBooked,
    }));
    const totalAmountInPaise = itemsToCreate.reduce(
      (sum, i) => sum + i.subtotalInPaise, 0,
    );

    // 3. Create booking with nested items
    return tx.propertyBooking.create({
      data: {
        guestUserId,
        propertyId: property.id,
        guestName, guestPhone, guestEmail,
        numGuests,
        checkIn, checkOut, nights,
        totalAmountInPaise,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING', // MVP — payment gateway not integrated yet
        specialRequests: specialRequests ?? null,
        items: { create: itemsToCreate },
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
