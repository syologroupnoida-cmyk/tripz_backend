import { z } from 'zod';

// =============================================================================
//   Package validators
// =============================================================================
//
// Frontend payload notes (adapters below tolerate its quirks):
//   • Prices arrive as strings ("120" INR) — we coerce to number, then × 100
//     for paise storage.
//   • Image fields may arrive as either a plain URL string OR a wrapper object
//     ({ uploadedUrl, uploadId, fileName, ... }). We accept both and normalise
//     to a URL string.
//   • `agent` from client is silently DROPPED — owner comes from JWT.
//   • `status` from client is silently DROPPED — server state machine only.
//   • Both `images` and `galleryImages` may arrive; treat as aliases.
// =============================================================================

// ---- Reusable field builders ----

const trimmedRequired = (min, max, label) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters long`)
    .max(max, `${label} must not exceed ${max} characters`);

const trimmedOptional = (max, label) =>
  z.string().trim().max(max, `${label} must not exceed ${max} characters`).optional();

const trimmedOptionalNullable = (max, label) =>
  z.string().trim().max(max, `${label} must not exceed ${max} characters`).optional().nullable();

// "true"/"false" → boolean, undefined stays undefined.
const stringBool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

// "120" or 120 → paise (integer × 100). Empty / invalid → undefined so
// downstream .optional() can decide.
const rupeeStringToPaise = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'string' ? Number(v) : v;
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n * 100);
  });

// Same as above but the field is required and blank/invalid → error via refine.
const requiredRupeeToPaise = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    if (v === undefined || v === null || v === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'price is required' });
      return z.NEVER;
    }
    const n = typeof v === 'string' ? Number(v) : v;
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'price must be a non-negative number' });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

// "10" or 10 → integer percent (0-100). Empty → undefined.
const percentField = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'string' ? Number(v) : v;
    if (!Number.isFinite(n)) return undefined;
    return Math.max(0, Math.min(100, Math.round(n)));
  });

// Accept string URL or wrapper object with `uploadedUrl` (frontend upload
// staging metadata). Normalises to the URL string. Rejects empty strings.
const imageUrlField = z
  .union([
    z.string().trim().min(1).max(1000),
    z
      .object({
        uploadedUrl: z.string().trim().min(1).max(1000),
      })
      .passthrough(),
  ])
  .transform((v) => (typeof v === 'string' ? v : v.uploadedUrl));

const optionalImageUrl = imageUrlField.optional();

const imageArrayField = z
  .array(
    z.union([
      z.string().trim().min(1).max(1000),
      z
        .object({
          uploadedUrl: z.string().trim().min(1).max(1000),
        })
        .passthrough(),
    ]),
  )
  .max(20, 'A package can have at most 20 gallery images')
  .transform((arr) => arr.map((v) => (typeof v === 'string' ? v : v.uploadedUrl)));

// String array with per-item trim + max-length guard.
const stringArrayField = (perItemMax, arrMax, label) =>
  z
    .array(z.string().trim().min(1).max(perItemMax, `${label} item too long`))
    .max(arrMax, `${label} has too many items`);

// Itinerary day entry: { day, title, text }. day/title required, text optional.
const itineraryItemSchema = z.object({
  day: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().max(2000).optional().default(''),
});

// ---- Enums (must match Prisma enums) ----
const packageRegionEnum = z.enum([
  'NATIONAL',
  'INTERNATIONAL'
]);

const packageTypeEnum = z.enum([
  'HONEYMOON',
  'FAMILY',
  'HOLIDAY',
  'COUPLE',
  'SOLO',
  'GROUP',
  'ADVENTURE',
  'RELIGIOUS',
  'BEACH',
  'HILL_STATION',
  'WILDLIFE',
  'CULTURAL',
  'CORPORATE',
  'OTHER',
]);

const validityTypeEnum = z.enum(['EVERGREEN', 'SEASONAL']);
const packageStatusEnum = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAUSED']);

// ISO date-ish string → Date. Empty → undefined.
const dateField = z
  .union([z.string(), z.date()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    if (v instanceof Date) return v;
    const parsed = new Date(v);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  });

// -----------------------------------------------------------------------------
//   POST /vendor/packages ?draft=true|false — create-time action modifier
// -----------------------------------------------------------------------------
// `?draft=true`  (default) → row is created in DRAFT status
// `?draft=false`           → row is created directly in SUBMITTED status
//                            (skips the two-step workflow for vendors who've
//                            filled everything up front and want to publish now)
export const createPackageQuerySchema = z
  .object({
    draft: z.enum(['true', 'false']).optional().default('true'),
  })
  .strict()
  .transform((q) => ({ asDraft: q.draft !== 'false' }));

// -----------------------------------------------------------------------------
//   Submit-time completeness check
// -----------------------------------------------------------------------------
// The fields a package MUST carry before it can move from DRAFT/REJECTED to
// SUBMITTED (or be created directly with ?draft=false). Used by the service
// layer to produce a friendly `missingFields` list for the frontend so it
// can highlight the offending inputs.
export const REQUIRED_FIELDS_FOR_SUBMIT = [
  'title',
  'destination',
  'overview',
  'packageType',
  'packageRegion',
  'mainImageUrl',
  'priceInPaise',
];

/**
 * Return the list of required fields that are missing/empty on the given
 * package row. Also enforces the SEASONAL cross-field rule (needs date window).
 * Empty strings, nulls and undefined all count as missing.
 */
export const getMissingRequiredFields = (pkg) => {
  const missing = [];
  for (const field of REQUIRED_FIELDS_FOR_SUBMIT) {
    const v = pkg?.[field];
    if (v === null || v === undefined || v === '') missing.push(field);
  }
  if (pkg?.validityType === 'SEASONAL') {
    if (!pkg.startDate) missing.push('startDate');
    if (!pkg.endDate) missing.push('endDate');
  }
  return missing;
};

// -----------------------------------------------------------------------------
//   POST /vendor/packages?draft=true — create DRAFT (lenient)
// -----------------------------------------------------------------------------
// Draft-time schema: only `title` is required. Every other field can be blank
// or omitted so vendors can save progress in stages. Cross-field constraints
// (SEASONAL date window, endDate ≥ startDate, oldPrice ≥ price) only fire
// when the relevant pair is actually supplied together — a half-filled
// draft never trips them.
//
// Completeness of the "real" required fields (destination, overview, price,
// packageType, packageRegion, mainImage) is deferred to the /submit path.
export const createDraftPackageSchema = z
  .object({
    title: trimmedRequired(2, 200, 'title'),
    agencyName: trimmedOptional(200, 'agencyName'),
    destination: trimmedOptional(120, 'destination'),
    route: trimmedOptional(120, 'route'),
    duration: trimmedOptional(60, 'duration'),
    overview: trimmedOptional(5000, 'overview'),
    otherDetails: trimmedOptional(5000, 'otherDetails'),
    cancellationPolicy: trimmedOptional(10000, 'cancellationPolicy'),
    packageRegion: packageRegionEnum.optional(),
    packageType: packageTypeEnum.optional(),
    validityType: validityTypeEnum.optional().default('EVERGREEN'),

    startDate: dateField,
    endDate: dateField,

    price: rupeeStringToPaise,
    oldPrice: rupeeStringToPaise,
    discount: percentField,

    hotelCategory: trimmedOptional(40, 'hotelCategory'),
    transfers: trimmedOptional(120, 'transfers'),
    meals: trimmedOptional(120, 'meals'),
    sightseeing: trimmedOptional(500, 'sightseeing'),

    mainImage: optionalImageUrl,
    images: imageArrayField.optional(),
    galleryImages: imageArrayField.optional(),

    highlights: stringArrayField(200, 30, 'highlights').optional().default([]),
    inclusions: stringArrayField(200, 30, 'inclusions').optional().default([]),
    exclusions: stringArrayField(200, 30, 'exclusions').optional().default([]),
    itinerary: z.array(itineraryItemSchema).max(60).optional().default([]),

    offerTitle: trimmedOptional(120, 'offerTitle'),
    offerDescription: trimmedOptional(2000, 'offerDescription'),
  })
  .passthrough()
  .transform((raw) => {
    const galleryImageUrls = raw.galleryImages ?? raw.images ?? [];
    return {
      title: raw.title,
      agencyName: raw.agencyName,
      destination: raw.destination,
      route: raw.route,
      duration: raw.duration,
      overview: raw.overview,
      otherDetails: raw.otherDetails,
      cancellationPolicy: raw.cancellationPolicy,
      packageRegion: raw.packageRegion,
      packageType: raw.packageType,
      validityType: raw.validityType,
      startDate: raw.startDate,
      endDate: raw.endDate,
      priceInPaise: raw.price,
      oldPriceInPaise: raw.oldPrice,
      discountPercent: raw.discount,
      hotelCategory: raw.hotelCategory,
      transfers: raw.transfers,
      meals: raw.meals,
      sightseeing: raw.sightseeing,
      mainImageUrl: raw.mainImage,
      galleryImageUrls,
      highlights: raw.highlights,
      inclusions: raw.inclusions,
      exclusions: raw.exclusions,
      itinerary: raw.itinerary,
      offerTitle: raw.offerTitle,
      offerDescription: raw.offerDescription,
    };
  })
  // Cross-field constraints only fire when the relevant pair is supplied.
  .refine(
    (data) => {
      if (data.validityType !== 'SEASONAL') return true;
      // For DRAFT, allow one or both to be missing — completeness check at
      // /submit is where the real gate lives.
      if (!data.startDate && !data.endDate) return true;
      if (data.startDate && data.endDate) return true;
      return false;
    },
    { message: 'For SEASONAL, provide both startDate and endDate together', path: ['startDate'] },
  )
  .refine(
    (data) => {
      if (!data.startDate || !data.endDate) return true;
      return data.endDate.getTime() >= data.startDate.getTime();
    },
    { message: 'endDate must be on or after startDate', path: ['endDate'] },
  )
  .refine(
    (data) => {
      if (data.oldPriceInPaise === undefined || data.priceInPaise === undefined) return true;
      return data.oldPriceInPaise >= data.priceInPaise;
    },
    { message: 'oldPrice must be greater than or equal to price', path: ['oldPrice'] },
  );

// -----------------------------------------------------------------------------
//   POST /vendor/packages?draft=false — create + submit direct (strict)
// -----------------------------------------------------------------------------
// Strict schema — all fields required for a valid marketplace-ready package.
// Used only when the vendor explicitly opts into ?draft=false. The service
// layer additionally runs getMissingRequiredFields() before flipping to
// SUBMITTED so the vendor sees the same friendly error either way.
export const createPackageSchema = z
  .object({
    title: trimmedRequired(2, 200, 'title'),
    agencyName: trimmedOptional(200, 'agencyName'),
    destination: trimmedRequired(2, 120, 'destination'),
    route: trimmedOptional(120, 'route'),
    duration: trimmedOptional(60, 'duration'),
    overview: trimmedRequired(2, 5000, 'overview'),
    otherDetails: trimmedOptional(5000, 'otherDetails'),
    cancellationPolicy: trimmedOptional(10000, 'cancellationPolicy'),
    packageRegion: packageRegionEnum,
    packageType: packageTypeEnum,
    validityType: validityTypeEnum.optional().default('EVERGREEN'),

    startDate: dateField,
    endDate: dateField,

    // Frontend sends `price` / `oldPrice` / `discount` as strings; adapters
    // below map to canonical names.
    price: requiredRupeeToPaise,
    oldPrice: rupeeStringToPaise,
    discount: percentField,

    hotelCategory: trimmedOptional(40, 'hotelCategory'),
    transfers: trimmedOptional(120, 'transfers'),
    meals: trimmedOptional(120, 'meals'),
    sightseeing: trimmedOptional(500, 'sightseeing'),

    mainImage: imageUrlField, // Wrapper object or plain URL
    // Frontend sometimes sends both — treat as aliases, prefer whichever is present.
    images: imageArrayField.optional(),
    galleryImages: imageArrayField.optional(),

    highlights: stringArrayField(200, 30, 'highlights').optional().default([]),
    inclusions: stringArrayField(200, 30, 'inclusions').optional().default([]),
    exclusions: stringArrayField(200, 30, 'exclusions').optional().default([]),
    itinerary: z.array(itineraryItemSchema).max(60).optional().default([]),

    offerTitle: trimmedOptional(120, 'offerTitle'),
    offerDescription: trimmedOptional(2000, 'offerDescription'),
  })
  // Passthrough tolerates client noise (`agent`, `status`, `mainImage.size`
  // etc.). We reject nothing but the fields the state machine owns.
  .passthrough()
  .transform((raw) => {
    // Merge image aliases into canonical `galleryImageUrls`.
    const galleryImageUrls = raw.galleryImages ?? raw.images ?? [];

    // Rename to schema field names (raw.price → priceInPaise, etc.).
    return {
      title: raw.title,
      agencyName: raw.agencyName,
      destination: raw.destination,
      route: raw.route,
      duration: raw.duration,
      overview: raw.overview,
      otherDetails: raw.otherDetails,
      cancellationPolicy: raw.cancellationPolicy,

      packageRegion: raw.packageRegion,
      packageType: raw.packageType,
      validityType: raw.validityType,

      startDate: raw.startDate,
      endDate: raw.endDate,

      priceInPaise: raw.price,
      oldPriceInPaise: raw.oldPrice,
      discountPercent: raw.discount,

      hotelCategory: raw.hotelCategory,
      transfers: raw.transfers,
      meals: raw.meals,
      sightseeing: raw.sightseeing,

      mainImageUrl: raw.mainImage,
      galleryImageUrls,

      highlights: raw.highlights,
      inclusions: raw.inclusions,
      exclusions: raw.exclusions,
      itinerary: raw.itinerary,

      offerTitle: raw.offerTitle,
      offerDescription: raw.offerDescription,
    };
  })
  .refine(
    (data) => data.validityType !== 'SEASONAL' || (data.startDate && data.endDate),
    { message: 'SEASONAL packages require both startDate and endDate', path: ['startDate'] },
  )
  .refine(
    (data) => {
      if (!data.startDate || !data.endDate) return true;
      return data.endDate.getTime() >= data.startDate.getTime();
    },
    { message: 'endDate must be on or after startDate', path: ['endDate'] },
  )
  .refine(
    (data) => data.oldPriceInPaise === undefined || data.oldPriceInPaise >= data.priceInPaise,
    { message: 'oldPrice must be greater than or equal to price', path: ['oldPrice'] },
  );

// -----------------------------------------------------------------------------
//   PATCH /vendor/packages/:id ?draft=true|false — edit + optional transition
// -----------------------------------------------------------------------------
// `?draft=true`   (default) → just save the fields; status stays put.
// `?draft=false`            → after applying updates, run the completeness
//                              check and transition DRAFT/REJECTED → SUBMITTED
//                              in the same call.
//
// Symmetric with `POST /vendor/packages?draft=true|false`:
//   • On CREATE: draft=true → new row in DRAFT status. draft=false → SUBMITTED.
//   • On UPDATE: draft=true → keep in current draft-y status. draft=false →
//                             transition to SUBMITTED.
export const updatePackageQuerySchema = z
  .object({
    draft: z.enum(['true', 'false']).optional().default('true'),
  })
  .strict()
  .transform((q) => ({ asDraft: q.draft !== 'false' }));

// -----------------------------------------------------------------------------
//   PATCH /vendor/packages/:id — update draft or approved package
// -----------------------------------------------------------------------------
// Same fields as create, but everything is optional. Empty body is allowed
// (useful when only the `?submit=true` transition is needed). Cross-field
// constraints (SEASONAL requires dates, endDate ≥ startDate, oldPrice ≥ price)
// are only enforced when the relevant pair is supplied together.
export const updatePackageSchema = z
  .object({
    title: trimmedOptional(200, 'title'),
    agencyName: trimmedOptional(200, 'agencyName'),
    destination: trimmedOptional(120, 'destination'),
    route: trimmedOptional(120, 'route'),
    duration: trimmedOptional(60, 'duration'),
    overview: trimmedOptional(5000, 'overview'),
    otherDetails: trimmedOptional(5000, 'otherDetails'),
    cancellationPolicy: trimmedOptional(10000, 'cancellationPolicy'),
    packageRegion: packageRegionEnum.optional(),
    packageType: packageTypeEnum.optional(),
    validityType: validityTypeEnum.optional(),

    startDate: dateField,
    endDate: dateField,

    price: rupeeStringToPaise,
    oldPrice: rupeeStringToPaise,
    discount: percentField,

    hotelCategory: trimmedOptional(40, 'hotelCategory'),
    transfers: trimmedOptional(120, 'transfers'),
    meals: trimmedOptional(120, 'meals'),
    sightseeing: trimmedOptional(500, 'sightseeing'),

    mainImage: optionalImageUrl,
    images: imageArrayField.optional(),
    galleryImages: imageArrayField.optional(),

    highlights: stringArrayField(200, 30, 'highlights').optional(),
    inclusions: stringArrayField(200, 30, 'inclusions').optional(),
    exclusions: stringArrayField(200, 30, 'exclusions').optional(),
    itinerary: z.array(itineraryItemSchema).max(60).optional(),

    offerTitle: trimmedOptional(120, 'offerTitle'),
    offerDescription: trimmedOptional(2000, 'offerDescription'),
  })
  .passthrough()
  .transform((raw) => {
    const out = {};

    if (raw.title !== undefined) out.title = raw.title;
    if (raw.agencyName !== undefined) out.agencyName = raw.agencyName;
    if (raw.destination !== undefined) out.destination = raw.destination;
    if (raw.route !== undefined) out.route = raw.route;
    if (raw.duration !== undefined) out.duration = raw.duration;
    if (raw.overview !== undefined) out.overview = raw.overview;
    if (raw.otherDetails !== undefined) out.otherDetails = raw.otherDetails;
    if (raw.cancellationPolicy !== undefined) out.cancellationPolicy = raw.cancellationPolicy;

    if (raw.packageRegion !== undefined) out.packageRegion = raw.packageRegion;
    if (raw.packageType !== undefined) out.packageType = raw.packageType;
    if (raw.validityType !== undefined) out.validityType = raw.validityType;

    if (raw.startDate !== undefined) out.startDate = raw.startDate;
    if (raw.endDate !== undefined) out.endDate = raw.endDate;

    if (raw.price !== undefined) out.priceInPaise = raw.price;
    if (raw.oldPrice !== undefined) out.oldPriceInPaise = raw.oldPrice;
    if (raw.discount !== undefined) out.discountPercent = raw.discount;

    if (raw.hotelCategory !== undefined) out.hotelCategory = raw.hotelCategory;
    if (raw.transfers !== undefined) out.transfers = raw.transfers;
    if (raw.meals !== undefined) out.meals = raw.meals;
    if (raw.sightseeing !== undefined) out.sightseeing = raw.sightseeing;

    if (raw.mainImage !== undefined) out.mainImageUrl = raw.mainImage;
    // Only overwrite gallery when the client explicitly sends one of the
    // aliases; otherwise the DB copy stays untouched by a partial PATCH.
    if (raw.galleryImages !== undefined) out.galleryImageUrls = raw.galleryImages;
    else if (raw.images !== undefined) out.galleryImageUrls = raw.images;

    if (raw.highlights !== undefined) out.highlights = raw.highlights;
    if (raw.inclusions !== undefined) out.inclusions = raw.inclusions;
    if (raw.exclusions !== undefined) out.exclusions = raw.exclusions;
    if (raw.itinerary !== undefined) out.itinerary = raw.itinerary;

    if (raw.offerTitle !== undefined) out.offerTitle = raw.offerTitle;
    if (raw.offerDescription !== undefined) out.offerDescription = raw.offerDescription;

    return out;
  })
  // Empty body is intentionally allowed — a `PATCH ?submit=true` with no body
  // is a valid "just transition to SUBMITTED" call when the record already
  // has every required field.
  .refine(
    (data) => {
      if (data.startDate === undefined || data.endDate === undefined) return true;
      return data.endDate.getTime() >= data.startDate.getTime();
    },
    { message: 'endDate must be on or after startDate', path: ['endDate'] },
  )
  .refine(
    (data) => {
      if (data.priceInPaise === undefined || data.oldPriceInPaise === undefined) return true;
      return data.oldPriceInPaise >= data.priceInPaise;
    },
    { message: 'oldPrice must be greater than or equal to price', path: ['oldPrice'] },
  );

// -----------------------------------------------------------------------------
//   PATCH /vendor/packages/:id/pause ?paused=true|false — visibility toggle
// -----------------------------------------------------------------------------
// `?paused=true`  (default) → APPROVED → PAUSED (hides from marketplace)
// `?paused=false`           → PAUSED   → APPROVED (back on marketplace)
export const togglePausePackageQuerySchema = z
  .object({
    paused: z.enum(['true', 'false']).optional().default('true'),
  })
  .strict()
  .transform((q) => ({ paused: q.paused !== 'false' }));

// -----------------------------------------------------------------------------
//   POST /admin/packages/:id/reject — admin reject with reason
// -----------------------------------------------------------------------------
// Reason is REQUIRED so vendors know what to fix.
export const rejectPackageSchema = z
  .object({
    reason: trimmedRequired(5, 1000, 'reason'),
  })
  .strict();

// -----------------------------------------------------------------------------
//   GET /vendor/packages, /admin/packages, /packages (public) — filters + paging
// -----------------------------------------------------------------------------
const paginatedBase = {
  take: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(0).optional(),
  size: z.coerce.number().int().min(1).max(100).optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
};

const pagingTransform = (q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  return { take, skip };
};

// Vendor's own list — filter by status only.
export const listVendorPackagesQuerySchema = z
  .object({
    ...paginatedBase,
    status: packageStatusEnum.optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'title']).optional().default('createdAt'),
  })
  .strict()
  .transform((q) => ({
    status: q.status,
    sortBy: q.sortBy,
    order: q.order,
    ...pagingTransform(q),
  }));

// Admin list — status + destination + vendor + review-pending filter.
export const listAdminPackagesQuerySchema = z
  .object({
    ...paginatedBase,
    status: packageStatusEnum.optional(),
    destination: z.string().trim().max(120).optional(),
    vendorUserId: z.string().max(80).optional(),
    hasPendingReview: stringBool,
    sortBy: z
      .enum(['createdAt', 'updatedAt', 'submittedAt', 'reviewedAt', 'title'])
      .optional()
      .default('submittedAt'),
  })
  .strict()
  .transform((q) => ({
    status: q.status,
    destination: q.destination,
    vendorUserId: q.vendorUserId,
    hasPendingReview: q.hasPendingReview,
    sortBy: q.sortBy,
    order: q.order,
    ...pagingTransform(q),
  }));

// Public marketplace — only APPROVED + validity window respected.
export const publicPackagesQuerySchema = z
  .object({
    ...paginatedBase,
    destination: z.string().trim().max(120).optional(),
    packageRegion: packageRegionEnum.optional(),
    packageType: packageTypeEnum.optional(),
    validityType: validityTypeEnum.optional(),
    // Free-form fields — matched with case-insensitive `contains` so vendors
    // don't need to hit exact strings ("4N" matches "4N/2D", "4N/3D" etc.).
    duration: z.string().trim().max(60).optional(),
    hotelCategory: z.string().trim().max(40).optional(),
    // Rupee-range filters — transformed to paise.
    minPrice: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => {
        if (v === undefined || v === null || v === '') return undefined;
        const n = typeof v === 'string' ? Number(v) : v;
        return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
      }),
    maxPrice: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => {
        if (v === undefined || v === null || v === '') return undefined;
        const n = typeof v === 'string' ? Number(v) : v;
        return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
      }),
    sortBy: z
      .enum(['createdAt', 'priceInPaise', 'title'])
      .optional()
      .default('createdAt'),
  })
  .strict()
  .transform((q) => ({
    destination: q.destination,
    packageRegion: q.packageRegion,
    packageType: q.packageType,
    validityType: q.validityType,
    duration: q.duration,
    hotelCategory: q.hotelCategory,
    minPriceInPaise: q.minPrice,
    maxPriceInPaise: q.maxPrice,
    sortBy: q.sortBy,
    order: q.order,
    ...pagingTransform(q),
  }));
