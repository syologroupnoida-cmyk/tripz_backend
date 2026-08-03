import prisma from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';

// Utility: iterate every date in [start, end) yielding YYYY-MM-DD strings.
function* dateRange(start, end) {
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur < stop) {
    yield cur.toISOString().slice(0, 10);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

// Days count between two dates (exclusive of end) — same math as booking nights.
const daysBetween = (a, b) => Math.max(0, Math.ceil((b - a) / (1000 * 60 * 60 * 24)));

// ============================================================================
// 1. Inventory summary — per-room occupancy over a date window
// ============================================================================
// Returns for each room: total room-nights available, room-nights booked,
// occupancy %, upcoming booking count, and estimated revenue for the window.
export const getInventorySummary = async ({ ownerUserId, propertyId, fromDate, toDate }) => {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, deletedAt: null },
    select: {
      id: true, title: true, ownerUserId: true,
      rooms: {
        select: {
          id: true, name: true, category: true,
          pricePerNightInPaise: true, totalUnits: true, isActive: true,
        },
      },
    },
  });
  if (!property) throw ApiError.notFound('Property not found.');
  if (property.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only view your own properties.');
  }

  const windowNights = daysBetween(fromDate, toDate);

  const perRoom = await Promise.all(
    property.rooms.map(async (room) => {
      // Fetch matching PropertyBookingItems joined with their booking, since
      // multi-room bookings put each room's units on a separate item row.
      const items = await prisma.propertyBookingItem.findMany({
        where: {
          roomId: room.id,
          booking: {
            status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] },
            checkOut: { gt: fromDate },
            checkIn:  { lt: toDate },
          },
        },
        select: {
          unitsBooked: true,
          subtotalInPaise: true,
          bookingId: true,
          booking: { select: { checkIn: true, checkOut: true } },
        },
      });

      // Room-nights consumed within window (clamp booking dates to window)
      let bookedRoomNights = 0;
      let revenueInPaise = 0;
      const bookingIds = new Set();
      for (const it of items) {
        bookingIds.add(it.bookingId);
        const overlapStart = it.booking.checkIn > fromDate ? it.booking.checkIn : fromDate;
        const overlapEnd = it.booking.checkOut < toDate ? it.booking.checkOut : toDate;
        const overlapNights = daysBetween(overlapStart, overlapEnd);
        bookedRoomNights += overlapNights * it.unitsBooked;
        // Revenue: proportional share of this item's subtotal for the window
        const bookingNights = daysBetween(it.booking.checkIn, it.booking.checkOut);
        if (bookingNights > 0) {
          revenueInPaise += Math.round((it.subtotalInPaise * overlapNights) / bookingNights);
        }
      }

      const totalRoomNights = room.totalUnits * windowNights;
      const occupancyPercent = totalRoomNights > 0
        ? Math.round((bookedRoomNights / totalRoomNights) * 1000) / 10
        : 0;

      return {
        roomId: room.id,
        name: room.name,
        category: room.category,
        isActive: room.isActive,
        totalUnits: room.totalUnits,
        pricePerNightInPaise: room.pricePerNightInPaise,
        totalRoomNights,
        bookedRoomNights,
        occupancyPercent,
        activeBookings: bookingIds.size,
        estimatedRevenueInPaise: revenueInPaise,
      };
    }),
  );

  // Aggregate across all rooms
  const overall = perRoom.reduce((acc, r) => ({
    totalRoomNights: acc.totalRoomNights + r.totalRoomNights,
    bookedRoomNights: acc.bookedRoomNights + r.bookedRoomNights,
    estimatedRevenueInPaise: acc.estimatedRevenueInPaise + r.estimatedRevenueInPaise,
  }), { totalRoomNights: 0, bookedRoomNights: 0, estimatedRevenueInPaise: 0 });

  const overallOccupancy = overall.totalRoomNights > 0
    ? Math.round((overall.bookedRoomNights / overall.totalRoomNights) * 1000) / 10
    : 0;

  return {
    propertyId: property.id,
    propertyTitle: property.title,
    period: { from: iso(fromDate), to: iso(toDate), nights: windowNights },
    rooms: perRoom,
    overall: { ...overall, occupancyPercent: overallOccupancy },
  };
};

// ============================================================================
// 2. Calendar view — booking per date, per room, for a month
// ============================================================================
export const getPropertyCalendar = async ({ ownerUserId, propertyId, month }) => {
  // month = YYYY-MM string. Compute date range: first → last day + 1.
  const [year, monthNum] = month.split('-').map(Number);
  if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
    throw new ApiError(400, 'month must be in YYYY-MM format.');
  }
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 1));

  const property = await prisma.property.findFirst({
    where: { id: propertyId, deletedAt: null },
    select: {
      id: true, title: true, ownerUserId: true,
      rooms: {
        select: { id: true, name: true, category: true, totalUnits: true, isActive: true },
      },
    },
  });
  if (!property) throw ApiError.notFound('Property not found.');
  if (property.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only view your own properties.');
  }

  // Multi-room bookings store per-room quantities on PropertyBookingItem.
  // Fetch items joined with their booking header (once), then bucket by day.
  const items = await prisma.propertyBookingItem.findMany({
    where: {
      booking: {
        propertyId,
        status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] },
        checkOut: { gt: monthStart },
        checkIn:  { lt: monthEnd },
      },
    },
    select: {
      roomId: true,
      unitsBooked: true,
      bookingId: true,
      booking: {
        select: {
          id: true, checkIn: true, checkOut: true,
          guestName: true, status: true,
        },
      },
    },
  });

  // Build day-wise map: date → per-room booked units
  const days = [];
  for (const dayStr of dateRange(monthStart, monthEnd)) {
    const dayStart = new Date(`${dayStr}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const rooms = property.rooms.map((room) => {
      const overlaps = items.filter((it) =>
        it.roomId === room.id
        && it.booking.checkOut > dayStart
        && it.booking.checkIn < dayEnd,
      );
      const bookedUnits = overlaps.reduce((sum, it) => sum + it.unitsBooked, 0);
      // Dedupe bookings so the same multi-room booking appears once per row
      const seen = new Set();
      const bookings = [];
      for (const it of overlaps) {
        if (seen.has(it.bookingId)) continue;
        seen.add(it.bookingId);
        bookings.push({
          id: it.booking.id,
          guestName: it.booking.guestName,
          status: it.booking.status,
        });
      }
      return {
        roomId: room.id,
        name: room.name,
        totalUnits: room.totalUnits,
        bookedUnits,
        availableUnits: Math.max(0, room.totalUnits - bookedUnits),
        bookings,
      };
    });

    const totalBookedUnits = rooms.reduce((s, r) => s + r.bookedUnits, 0);
    const totalCapacity = rooms.reduce((s, r) => s + r.totalUnits, 0);
    days.push({
      date: dayStr,
      totalBookedUnits,
      totalCapacity,
      isFullyBooked: totalBookedUnits >= totalCapacity && totalCapacity > 0,
      rooms,
    });
  }

  return {
    propertyId: property.id,
    propertyTitle: property.title,
    month,
    days,
  };
};

// ============================================================================
// 3. Owner overview — aggregate stats across all owner's properties
// ============================================================================
export const getOwnerOverview = async ({ ownerUserId }) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const in7Days = new Date(today);
  in7Days.setUTCDate(in7Days.getUTCDate() + 7);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));

  // Property counts by status
  const propertyCounts = await prisma.property.groupBy({
    by: ['status'],
    where: { ownerUserId, deletedAt: null },
    _count: { id: true },
  });

  const propertyStatusMap = {
    total: 0, DRAFT: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0, PAUSED: 0,
  };
  for (const row of propertyCounts) {
    propertyStatusMap[row.status] = row._count.id;
    propertyStatusMap.total += row._count.id;
  }

  // Pending-review count (post-approval edits)
  const pendingReviewCount = await prisma.property.count({
    where: { ownerUserId, deletedAt: null, hasPendingReview: true },
  });

  const bookingWhereBase = { property: { ownerUserId, deletedAt: null } };

  // Today's arrivals (checkIn === today, CONFIRMED)
  const todayArrivals = await prisma.propertyBooking.count({
    where: {
      ...bookingWhereBase, status: 'CONFIRMED',
      checkIn: { gte: today, lt: tomorrow },
    },
  });

  // Today's departures (checkOut === today, CHECKED_IN)
  const todayDepartures = await prisma.propertyBooking.count({
    where: {
      ...bookingWhereBase, status: 'CHECKED_IN',
      checkOut: { gte: today, lt: tomorrow },
    },
  });

  // Upcoming next 7 days (CONFIRMED, checkIn in [today, +7))
  const upcomingNext7Days = await prisma.propertyBooking.count({
    where: {
      ...bookingWhereBase, status: 'CONFIRMED',
      checkIn: { gte: today, lt: in7Days },
    },
  });

  // Currently in stay
  const currentlyInStay = await prisma.propertyBooking.count({
    where: { ...bookingWhereBase, status: 'CHECKED_IN' },
  });

  // Revenue this month — sum of totalAmount for bookings that stayed this month
  const revenueBookings = await prisma.propertyBooking.aggregate({
    where: {
      ...bookingWhereBase,
      status: { in: ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] },
      checkIn: { lt: monthEnd },
      checkOut: { gt: monthStart },
    },
    _sum: { totalAmountInPaise: true },
    _count: { id: true },
  });

  // Payout tracking
  const [awaitingPayout, paidThisMonth] = await Promise.all([
    prisma.propertyBooking.aggregate({
      where: {
        ...bookingWhereBase, status: 'COMPLETED', payoutStatus: 'PENDING',
      },
      _sum: { totalAmountInPaise: true },
      _count: { id: true },
    }),
    prisma.propertyBooking.aggregate({
      where: {
        ...bookingWhereBase, payoutStatus: 'PAID',
        payoutAt: { gte: monthStart, lt: monthEnd },
      },
      _sum: { payoutAmountInPaise: true },
      _count: { id: true },
    }),
  ]);

  return {
    properties: {
      total: propertyStatusMap.total,
      draft: propertyStatusMap.DRAFT,
      submitted: propertyStatusMap.SUBMITTED,
      approved: propertyStatusMap.APPROVED,
      rejected: propertyStatusMap.REJECTED,
      paused: propertyStatusMap.PAUSED,
      pendingReview: pendingReviewCount,
    },
    bookings: {
      todayArrivals,
      todayDepartures,
      upcomingNext7Days,
      currentlyInStay,
    },
    revenue: {
      thisMonthInPaise: revenueBookings._sum.totalAmountInPaise ?? 0,
      thisMonthBookingsCount: revenueBookings._count.id,
      awaitingPayoutInPaise: awaitingPayout._sum.totalAmountInPaise ?? 0,
      awaitingPayoutCount: awaitingPayout._count.id,
      paidOutThisMonthInPaise: paidThisMonth._sum.payoutAmountInPaise ?? 0,
      paidOutThisMonthCount: paidThisMonth._count.id,
    },
  };
};
