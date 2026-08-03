import { z } from 'zod';

const BOOKING_STATUSES = [
  'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED', 'CANCELLED', 'NO_SHOW',
];
const PAYOUT_STATUSES = ['PENDING', 'PAID', 'ON_HOLD'];

// ---- Date validators ----
const dateOnly = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .transform((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (isNaN(d.getTime())) throw new Error('Invalid date');
    return d;
  });

const phoneField = z.string()
  .trim()
  .regex(/^\d{10,15}$/, 'Phone must be 10 to 15 digits');

const emailField = z.string()
  .trim()
  .toLowerCase()
  .email('Invalid email address');

// ---- Rupees → paise ----
const rupeesToPaise = z.union([z.string(), z.number()])
  .transform((v, ctx) => {
    const n = typeof v === 'string' ? Number(v) : v;
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid amount' });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

// Single line-item in a multi-room booking payload.
const bookingItemSchema = z.object({
  roomId:      z.string({ required_error: 'items[].roomId is required' }).min(1),
  unitsBooked: z.coerce.number().int().min(1).max(20).default(1),
});

// ---- CREATE booking (guest side) ----
// Multi-room support: guest can book multiple room types in ONE booking
// (e.g. 1 AC + 2 Non-AC). Backend checks all items' availability atomically.
export const createBookingSchema = z.object({
  propertyId:      z.string({ required_error: 'propertyId is required' }).min(1),
  checkIn:         dateOnly,
  checkOut:        dateOnly,
  numGuests:       z.coerce.number().int().min(1).max(50).default(1),

  // One or more room-type line items. Same roomId can't repeat in one booking
  // (backend enforces via unique(bookingId, roomId) constraint).
  items: z.array(bookingItemSchema)
    .min(1, 'At least one room item is required')
    .max(20, 'Too many items — max 20 room types per booking'),

  // Guest info — snapshotted at booking time
  guestName:  z.string({ required_error: 'guestName is required' })
    .trim().min(2, 'guestName too short').max(120),
  guestPhone: phoneField,
  guestEmail: emailField,

  specialRequests: z.string().trim().max(2000).optional(),
})
.passthrough()
.refine((d) => d.checkOut > d.checkIn, {
  message: 'checkOut must be after checkIn',
  path: ['checkOut'],
})
.refine((d) => {
  // checkIn must be today or future (compare date-only, UTC)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return d.checkIn >= today;
}, {
  message: 'checkIn must be today or a future date',
  path: ['checkIn'],
})
.refine((d) => {
  // No duplicate roomId inside items[]
  const roomIds = d.items.map((i) => i.roomId);
  return new Set(roomIds).size === roomIds.length;
}, {
  message: 'items[] cannot contain the same roomId twice — combine them',
  path: ['items'],
})
.transform((d) => ({
  ...d,
  nights: Math.ceil((d.checkOut - d.checkIn) / (1000 * 60 * 60 * 24)),
}));

// ---- Cancel booking body (guest / owner) ----
export const cancelBookingSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
}).passthrough();

// ---- No-show mark (owner) ----
export const noShowSchema = z.object({
  notes: z.string().trim().min(3).max(500).optional(),
}).passthrough();

// ---- List queries ----

// Guest — my bookings
export const listMyBookingsQuerySchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  take:   z.coerce.number().int().min(1).max(100).optional(),
  skip:   z.coerce.number().int().min(0).optional(),
  page:   z.coerce.number().int().min(0).optional(),
  size:   z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['createdAt', 'checkIn', 'checkOut']).optional().default('createdAt'),
  order:  z.enum(['asc', 'desc']).optional().default('desc'),
})
.strict()
.transform((q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  return { status: q.status, sortBy: q.sortBy, order: q.order, take, skip };
});

// Owner — all bookings across my properties
export const listOwnerBookingsQuerySchema = z.object({
  status:       z.enum(BOOKING_STATUSES).optional(),
  propertyId:   z.string().trim().max(100).optional(),
  fromDate:     dateOnly.optional(),
  toDate:       dateOnly.optional(),
  payoutStatus: z.enum(PAYOUT_STATUSES).optional(),
  take:         z.coerce.number().int().min(1).max(100).optional(),
  skip:         z.coerce.number().int().min(0).optional(),
  page:         z.coerce.number().int().min(0).optional(),
  size:         z.coerce.number().int().min(1).max(100).optional(),
  sortBy:       z.enum(['createdAt', 'checkIn', 'checkOut']).optional().default('checkIn'),
  order:        z.enum(['asc', 'desc']).optional().default('desc'),
})
.strict()
.transform((q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  return {
    status: q.status,
    propertyId: q.propertyId,
    fromDate: q.fromDate,
    toDate: q.toDate,
    payoutStatus: q.payoutStatus,
    sortBy: q.sortBy, order: q.order, take, skip,
  };
});

// Admin — all bookings platform-wide
export const listAdminBookingsQuerySchema = z.object({
  status:       z.enum(BOOKING_STATUSES).optional(),
  propertyId:   z.string().trim().max(100).optional(),
  ownerUserId:  z.string().trim().max(100).optional(),
  guestUserId:  z.string().trim().max(100).optional(),
  fromDate:     dateOnly.optional(),
  toDate:       dateOnly.optional(),
  payoutStatus: z.enum(PAYOUT_STATUSES).optional(),
  search:       z.string().trim().max(200).optional(), // guest name/email
  take:         z.coerce.number().int().min(1).max(100).optional(),
  skip:         z.coerce.number().int().min(0).optional(),
  page:         z.coerce.number().int().min(0).optional(),
  size:         z.coerce.number().int().min(1).max(100).optional(),
  sortBy:       z.enum(['createdAt', 'checkIn', 'checkOut']).optional().default('createdAt'),
  order:        z.enum(['asc', 'desc']).optional().default('desc'),
})
.strict()
.transform((q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  return {
    status: q.status,
    propertyId: q.propertyId,
    ownerUserId: q.ownerUserId,
    guestUserId: q.guestUserId,
    fromDate: q.fromDate,
    toDate: q.toDate,
    payoutStatus: q.payoutStatus,
    search: q.search,
    sortBy: q.sortBy, order: q.order, take, skip,
  };
});

// ---- Admin: record payout ----
// Admin manually enters commission negotiated over call, marks payout done.
export const recordPayoutSchema = z.object({
  commission:      rupeesToPaise, // Amount kept by platform (in rupees)
  payoutReference: z.string({ required_error: 'payoutReference is required' })
    .trim()
    .min(3, 'payoutReference too short')
    .max(120, 'payoutReference too long'),
  payoutNotes: z.string().trim().max(2000).optional(),
}).passthrough();
