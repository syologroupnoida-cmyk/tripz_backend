import { z } from 'zod';

// ---- Enum values (must mirror Prisma enums) ----
export const PROPERTY_TYPES = [
  'HOTEL', 'VILLA', 'HOMESTAY', 'STUDIO', 'RESORT', 'GUEST_HOUSE',
];

const PROPERTY_STATUSES = [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAUSED',
];

// ---- Reusable helpers ----
const trimmedRequired = (min, max, label) =>
  z.string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must not exceed ${max} characters`);

const trimmedOptional = (max, label) =>
  z.string().trim().max(max, `${label} must not exceed ${max} characters`).optional();

// Number field accepting string or number (frontend often sends strings)
const numberField = (min, max, label) =>
  z.union([z.string(), z.number()])
    .transform((v, ctx) => {
      const n = typeof v === 'string' ? Number(v) : v;
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be between ${min}-${max}` });
        return z.NEVER;
      }
      return n;
    });

const intField = (min, max, label) =>
  z.union([z.string(), z.number()])
    .transform((v, ctx) => {
      const n = typeof v === 'string' ? parseInt(v, 10) : v;
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be an integer between ${min}-${max}` });
        return z.NEVER;
      }
      return n;
    });

// Time in "HH:mm" 24hr format
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm 24hr format');

// Rupees → paise converter (frontend sends rupees, DB stores paise)
const rupeesToPaise = z.union([z.string(), z.number()])
  .transform((v, ctx) => {
    const n = typeof v === 'string' ? Number(v) : v;
    if (!Number.isFinite(n) || n < 0 || n > 10000000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount must be between 0 and 1,00,00,000 rupees' });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

// ---- Room schema (embedded in property create/update) ----
export const roomInputSchema = z.object({
  name:                 trimmedRequired(2, 80, 'room name'),
  description:          trimmedOptional(2000, 'room description'),
  category:             trimmedOptional(40, 'room category'),
  pricePerNight:        rupeesToPaise, // rupees → paise
  extraGuestFee:        rupeesToPaise.optional(),
  maxGuests:            intField(1, 30, 'maxGuests'),
  totalUnits:           intField(1, 200, 'totalUnits').optional().default(1),
  bedrooms:             intField(0, 20, 'bedrooms').optional(),
  bathrooms:            intField(0, 20, 'bathrooms').optional(),
  bedType:              trimmedOptional(40, 'bedType'),
  roomSizeSqft:         intField(0, 100000, 'roomSizeSqft').optional(),
  amenities:            z.array(z.string().trim().min(1).max(60)).max(30).optional().default([]),
  images:               z.array(z.string().trim().min(1).max(1000)).max(15).optional().default([]),
  isActive:             z.boolean().optional().default(true),
})
.passthrough()
.transform((r) => ({
  name: r.name,
  description: r.description ?? null,
  category: r.category ?? null,
  pricePerNightInPaise: r.pricePerNight,
  extraGuestFeeInPaise: r.extraGuestFee ?? null,
  maxGuests: r.maxGuests,
  totalUnits: r.totalUnits,
  bedrooms: r.bedrooms ?? null,
  bathrooms: r.bathrooms ?? null,
  bedType: r.bedType ?? null,
  roomSizeSqft: r.roomSizeSqft ?? null,
  amenities: r.amenities ?? [],
  images: r.images ?? [],
  isActive: r.isActive,
}));

// Standalone room update schema — all optional, at least one required
export const roomUpdateSchema = z.object({
  name:                 trimmedOptional(80, 'room name'),
  description:          trimmedOptional(2000, 'room description'),
  category:             trimmedOptional(40, 'room category'),
  pricePerNight:        rupeesToPaise.optional(),
  extraGuestFee:        rupeesToPaise.optional(),
  maxGuests:            intField(1, 30, 'maxGuests').optional(),
  totalUnits:           intField(1, 200, 'totalUnits').optional(),
  bedrooms:             intField(0, 20, 'bedrooms').optional(),
  bathrooms:            intField(0, 20, 'bathrooms').optional(),
  bedType:              trimmedOptional(40, 'bedType'),
  roomSizeSqft:         intField(0, 100000, 'roomSizeSqft').optional(),
  amenities:            z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  images:               z.array(z.string().trim().min(1).max(1000)).max(15).optional(),
  isActive:             z.boolean().optional(),
})
.passthrough()
.refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' })
.transform((r) => {
  const out = {};
  if (r.name !== undefined) out.name = r.name;
  if (r.description !== undefined) out.description = r.description;
  if (r.category !== undefined) out.category = r.category;
  if (r.pricePerNight !== undefined) out.pricePerNightInPaise = r.pricePerNight;
  if (r.extraGuestFee !== undefined) out.extraGuestFeeInPaise = r.extraGuestFee;
  if (r.maxGuests !== undefined) out.maxGuests = r.maxGuests;
  if (r.totalUnits !== undefined) out.totalUnits = r.totalUnits;
  if (r.bedrooms !== undefined) out.bedrooms = r.bedrooms;
  if (r.bathrooms !== undefined) out.bathrooms = r.bathrooms;
  if (r.bedType !== undefined) out.bedType = r.bedType;
  if (r.roomSizeSqft !== undefined) out.roomSizeSqft = r.roomSizeSqft;
  if (r.amenities !== undefined) out.amenities = r.amenities;
  if (r.images !== undefined) out.images = r.images;
  if (r.isActive !== undefined) out.isActive = r.isActive;
  return out;
});

// ---- CREATE property schema (lenient — can save as draft) ----
export const createPropertySchema = z.object({
  title:            trimmedRequired(2, 200, 'title'),
  propertyType:     z.enum(PROPERTY_TYPES, {
    errorMap: () => ({ message: `propertyType must be one of: ${PROPERTY_TYPES.join(', ')}` }),
  }),
  shortDescription: trimmedOptional(500, 'shortDescription'),
  fullDescription:  trimmedOptional(20000, 'fullDescription'),

  city:      trimmedOptional(80, 'city'),
  state:     trimmedOptional(80, 'state'),
  country:   trimmedOptional(80, 'country'),
  address:   trimmedOptional(500, 'address'),
  landmark:  trimmedOptional(120, 'landmark'),
  pincode:   trimmedOptional(20, 'pincode'),
  latitude:  numberField(-90, 90, 'latitude').optional(),
  longitude: numberField(-180, 180, 'longitude').optional(),

  mainImage:     trimmedOptional(1000, 'mainImage'),
  galleryImages: z.array(z.string().trim().min(1).max(1000)).max(30).optional().default([]),

  amenities:    z.array(z.string().trim().min(1).max(60)).max(50).optional().default([]),
  houseRules:   z.array(z.string().trim().min(1).max(200)).max(30).optional().default([]),
  nearbyPlaces: z.array(z.string().trim().min(1).max(200)).max(30).optional().default([]),
  highlights:   z.array(z.string().trim().min(1).max(200)).max(30).optional().default([]),

  starRating:      intField(1, 5, 'starRating').optional(),
  totalBedrooms:   intField(0, 100, 'totalBedrooms').optional(),
  totalBathrooms:  intField(0, 100, 'totalBathrooms').optional(),
  hostLivesOnsite: z.boolean().optional().default(false),

  checkInTime:   timeField.optional().default('14:00'),
  checkOutTime:  timeField.optional().default('11:00'),
  minStayNights: intField(1, 365, 'minStayNights').optional().default(1),

  contactPhone: trimmedOptional(20, 'contactPhone'),
  contactEmail: z.string().email().optional().or(z.literal('').transform(() => undefined)),

  cancellationPolicy: z.any().optional(),

  // Rooms can be added at create time OR later via /rooms endpoints
  rooms: z.array(roomInputSchema).max(50).optional().default([]),
}).passthrough();

// ---- Strict version — used when submitting for admin review ----
// Frontend calls with ?submit=true → this validates ALL required fields present.
export const submitPropertySchema = createPropertySchema
  .refine((d) => d.shortDescription && d.shortDescription.length >= 20, {
    message: 'shortDescription is required for submission (min 20 chars)',
    path: ['shortDescription'],
  })
  .refine((d) => d.fullDescription && d.fullDescription.length >= 50, {
    message: 'fullDescription is required for submission (min 50 chars)',
    path: ['fullDescription'],
  })
  .refine((d) => d.city, { message: 'city is required', path: ['city'] })
  .refine((d) => d.state, { message: 'state is required', path: ['state'] })
  .refine((d) => d.address, { message: 'address is required', path: ['address'] })
  .refine((d) => d.mainImage, { message: 'mainImage is required', path: ['mainImage'] })
  .refine((d) => (d.galleryImages ?? []).length >= 2, {
    message: 'At least 2 gallery images required',
    path: ['galleryImages'],
  });

// ---- UPDATE property (partial, all optional) ----
export const updatePropertySchema = z.object({
  title:            trimmedOptional(200, 'title'),
  propertyType:     z.enum(PROPERTY_TYPES).optional(),
  shortDescription: trimmedOptional(500, 'shortDescription'),
  fullDescription:  trimmedOptional(20000, 'fullDescription'),

  city:      trimmedOptional(80, 'city'),
  state:     trimmedOptional(80, 'state'),
  country:   trimmedOptional(80, 'country'),
  address:   trimmedOptional(500, 'address'),
  landmark:  trimmedOptional(120, 'landmark'),
  pincode:   trimmedOptional(20, 'pincode'),
  latitude:  numberField(-90, 90, 'latitude').optional(),
  longitude: numberField(-180, 180, 'longitude').optional(),

  mainImage:     trimmedOptional(1000, 'mainImage'),
  galleryImages: z.array(z.string().trim().min(1).max(1000)).max(30).optional(),

  amenities:    z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  houseRules:   z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  nearbyPlaces: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  highlights:   z.array(z.string().trim().min(1).max(200)).max(30).optional(),

  starRating:      intField(1, 5, 'starRating').optional(),
  totalBedrooms:   intField(0, 100, 'totalBedrooms').optional(),
  totalBathrooms:  intField(0, 100, 'totalBathrooms').optional(),
  hostLivesOnsite: z.boolean().optional(),

  checkInTime:   timeField.optional(),
  checkOutTime:  timeField.optional(),
  minStayNights: intField(1, 365, 'minStayNights').optional(),

  contactPhone: trimmedOptional(20, 'contactPhone'),
  contactEmail: z.string().email().optional().or(z.literal('').transform(() => undefined)),

  cancellationPolicy: z.any().optional(),
})
.passthrough()
.refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });

// ---- List query filters (vendor's own properties) ----
export const listMyPropertiesQuerySchema = z.object({
  status:       z.enum(PROPERTY_STATUSES).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  take:         z.coerce.number().int().min(1).max(100).optional(),
  skip:         z.coerce.number().int().min(0).optional(),
  page:         z.coerce.number().int().min(0).optional(),
  size:         z.coerce.number().int().min(1).max(100).optional(),
  sortBy:       z.enum(['createdAt', 'updatedAt', 'title']).optional().default('createdAt'),
  order:        z.enum(['asc', 'desc']).optional().default('desc'),
})
.strict()
.transform((q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  return {
    status: q.status,
    propertyType: q.propertyType,
    sortBy: q.sortBy,
    order: q.order,
    take, skip,
  };
});

// ---- Create/update query flags ----
// ?draft=true|false — mirrors Package pattern
export const createPropertyQuerySchema = z.object({
  draft: z.enum(['true', 'false']).optional().default('true'),
})
.strict()
.transform((q) => ({ draft: q.draft === 'true' }));

export const updatePropertyQuerySchema = z.object({
  draft: z.enum(['true', 'false']).optional().default('true'),
})
.strict()
.transform((q) => ({ draft: q.draft === 'true' }));

// ---- Pause/resume query ----
export const pausePropertyQuerySchema = z.object({
  paused: z.enum(['true', 'false']).optional().default('true'),
})
.strict()
.transform((q) => ({ paused: q.paused === 'true' }));

// ---- Admin: list moderation queue ----
export const listAdminPropertiesQuerySchema = z.object({
  status:            z.enum(PROPERTY_STATUSES).optional(),
  propertyType:      z.enum(PROPERTY_TYPES).optional(),
  hasPendingReview:  z.enum(['true', 'false']).optional(),
  ownerUserId:       z.string().trim().max(100).optional(),
  city:              z.string().trim().max(80).optional(),
  search:            z.string().trim().max(200).optional(),
  take:              z.coerce.number().int().min(1).max(100).optional(),
  skip:              z.coerce.number().int().min(0).optional(),
  page:              z.coerce.number().int().min(0).optional(),
  size:              z.coerce.number().int().min(1).max(100).optional(),
  sortBy:            z.enum(['createdAt', 'updatedAt', 'submittedAt', 'title']).optional().default('submittedAt'),
  order:             z.enum(['asc', 'desc']).optional().default('desc'),
})
.strict()
.transform((q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  return {
    status: q.status,
    propertyType: q.propertyType,
    hasPendingReview: q.hasPendingReview === undefined ? undefined : q.hasPendingReview === 'true',
    ownerUserId: q.ownerUserId,
    city: q.city,
    search: q.search,
    sortBy: q.sortBy,
    order: q.order,
    take, skip,
  };
});

// ---- Admin: reject body (reason required) ----
export const rejectPropertySchema = z.object({
  reason: z.string({ required_error: 'Rejection reason is required' })
    .trim()
    .min(5, 'Rejection reason must be at least 5 characters')
    .max(1000, 'Rejection reason must not exceed 1000 characters'),
}).passthrough();

// ---- Public: date validator (YYYY-MM-DD) ----
// Coerces string to Date; strips time so it's date-only.
const dateOnly = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .transform((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (isNaN(d.getTime())) throw new Error('Invalid date');
    return d;
  });

// ---- Public: marketplace browse ----
// Guests browse without auth. Filters by city, dates, guests, price, type.
// Dates optional — if provided, backend filters out fully-booked properties.
export const publicPropertiesQuerySchema = z.object({
  city:         z.string().trim().max(80).optional(),
  state:        z.string().trim().max(80).optional(),
  country:      z.string().trim().max(80).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  minPrice:     z.coerce.number().min(0).optional(),  // Rupees
  maxPrice:     z.coerce.number().min(0).optional(),  // Rupees
  guests:       z.coerce.number().int().min(1).max(50).optional(),
  starRating:   z.coerce.number().int().min(1).max(5).optional(),
  amenities:    z.string().trim().max(500).optional(), // "WiFi,Pool,AC" — comma separated
  checkIn:      dateOnly.optional(),
  checkOut:     dateOnly.optional(),
  search:       z.string().trim().max(200).optional(),
  take:         z.coerce.number().int().min(1).max(100).optional(),
  skip:         z.coerce.number().int().min(0).optional(),
  page:         z.coerce.number().int().min(0).optional(),
  size:         z.coerce.number().int().min(1).max(100).optional(),
  sortBy:       z.enum(['createdAt', 'price', 'starRating']).optional().default('createdAt'),
  order:        z.enum(['asc', 'desc']).optional().default('desc'),
})
.strict()
.refine(
  (q) => !(q.checkIn && q.checkOut) || q.checkOut > q.checkIn,
  { message: 'checkOut must be after checkIn', path: ['checkOut'] },
)
.refine(
  (q) => !(q.checkIn && !q.checkOut) && !(q.checkOut && !q.checkIn),
  { message: 'Both checkIn and checkOut must be provided together', path: ['checkOut'] },
)
.transform((q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  // Amenities: "WiFi,Pool" → ["WiFi", "Pool"]
  const amenities = q.amenities
    ? q.amenities.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;
  return {
    city: q.city,
    state: q.state,
    country: q.country,
    propertyType: q.propertyType,
    minPriceInPaise: q.minPrice !== undefined ? Math.round(q.minPrice * 100) : undefined,
    maxPriceInPaise: q.maxPrice !== undefined ? Math.round(q.maxPrice * 100) : undefined,
    guests: q.guests,
    starRating: q.starRating,
    amenities,
    checkIn: q.checkIn,
    checkOut: q.checkOut,
    search: q.search,
    sortBy: q.sortBy,
    order: q.order,
    take, skip,
  };
});

// ---- Dashboard queries (owner) ----

// Inventory summary — date range required.
export const inventorySummaryQuerySchema = z.object({
  fromDate: dateOnly,
  toDate:   dateOnly,
})
.strict()
.refine((q) => q.toDate > q.fromDate, {
  message: 'toDate must be after fromDate',
  path: ['toDate'],
})
.transform((q) => ({ fromDate: q.fromDate, toDate: q.toDate }));

// Calendar view — month required (YYYY-MM).
export const calendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be in YYYY-MM format'),
})
.strict()
.transform((q) => ({ month: q.month }));

// ---- Public: availability check for a specific property ----
// Given checkIn + checkOut + optional guests, returns which rooms are available
// and the total price for the stay.
export const availabilityCheckQuerySchema = z.object({
  checkIn:  dateOnly,
  checkOut: dateOnly,
  guests:   z.coerce.number().int().min(1).max(50).optional().default(1),
})
.strict()
.refine((q) => q.checkOut > q.checkIn, {
  message: 'checkOut must be after checkIn',
  path: ['checkOut'],
})
.transform((q) => ({
  checkIn: q.checkIn,
  checkOut: q.checkOut,
  guests: q.guests,
  // Nights = days between dates
  nights: Math.ceil((q.checkOut - q.checkIn) / (1000 * 60 * 60 * 24)),
}));
