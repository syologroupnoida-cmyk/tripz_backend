import { z } from 'zod';
// Reusable halpers (Package validator se pattern le raha hu)

const trimmedRequired = (min, max, label) =>
  z.string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must not exceed ${max} characters`);

const trimmedOptional = (max, label) =>
  z.string().trim().max(max, `${label} must not exceed ${max} characters`).optional();

// "Yes"/"No"/boolean → boolean
// Frontend payload mein "visaRequired": "No" aa raha, backend Boolean expect
// karta hai — yeh helper dono handle karta hai
const yesNoBool = z.union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    const s = v.trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  });

// "1200"/1200 → Float (string/number dono accept)
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

// "true"/"false" → boolean, for query params
const stringBool = z.enum(['true', 'false']).optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

// ---- CREATE schema ----
// Strict: saare zaroori fields required
export const createTravelGuideSchema = z.object({
  title:            trimmedRequired(2, 200, 'title'),
  destination:      trimmedRequired(2, 120, 'destination').optional(),
  country:          trimmedRequired(2, 60, 'country').optional(),
  continent:        trimmedRequired(2, 40, 'continent').optional(),
  category:         trimmedRequired(2, 60, 'category').optional(),
  shortDescription: trimmedRequired(2, 500, 'shortDescription').optional(),
  description:      trimmedRequired(2, 10000, 'description').optional(),
  bestTimeToVisit:  trimmedRequired(2, 120, 'bestTimeToVisit').optional(),
  duration:         trimmedRequired(2, 60, 'duration').optional(),
  budget:           numberField(0, 10000000, 'budget').optional(),
  currency:         trimmedRequired(2, 10, 'currency').optional(),
  rating:           numberField(0, 5, 'rating').optional(),
  weather:          trimmedRequired(2, 40, 'weather').optional(),
  language:         trimmedRequired(2, 60, 'language').optional(),
  visaRequired:     yesNoBool.optional(),
  transportation:   trimmedRequired(2, 200, 'transportation').optional(),
  accommodation:    trimmedRequired(2, 200, 'accommodation').optional(),
  cuisine:          trimmedRequired(2, 200, 'cuisine').optional(),
  safetyRating:     numberField(0, 5, 'safetyRating').optional(),

  mainImage:        trimmedRequired(1, 1000, 'mainImage'),
  galleryImages:    z.array(z.string().trim().min(1).max(1000)).max(20).optional().default([]),
  highlights:       z.array(z.string().trim().min(1).max(200)).max(30).optional().default([]),
  activities:       z.array(z.string().trim().min(1).max(200)).max(30).optional().default([]),
  tips:             z.array(z.string().trim().min(1).max(500)).max(30).optional().default([]),
})
.passthrough(); // Extra fields silently accept

// ---- UPDATE schema ----
// Sab optional, "at least one field" refine se check
export const updateTravelGuideSchema = z.object({
  title:            trimmedOptional(200, 'title'),
  destination:      trimmedOptional(120, 'destination').optional(),
  country:          trimmedOptional(60, 'country').optional(),
  continent:        trimmedOptional(40, 'continent').optional(),
  category:         trimmedOptional(60, 'category').optional(),
  shortDescription: trimmedOptional(500, 'shortDescription').optional(),
  description:      trimmedOptional(10000, 'description').optional(),
  bestTimeToVisit:  trimmedOptional(120, 'bestTimeToVisit').optional(),
  duration:         trimmedOptional(60, 'duration').optional(),
  budget:           numberField(0, 10000000, 'budget').optional(),
  currency:         trimmedOptional(10, 'currency').optional(),
  rating:           numberField(0, 5, 'rating').optional(),
  weather:          trimmedOptional(40, 'weather').optional(),
  language:         trimmedOptional(60, 'language').optional(),
  visaRequired:     yesNoBool.optional(),
  transportation:   trimmedOptional(200, 'transportation').optional(),
  accommodation:    trimmedOptional(200, 'accommodation'),
  cuisine:          trimmedOptional(200, 'cuisine'),
  safetyRating:     numberField(0, 5, 'safetyRating').optional(),
  mainImage:        trimmedOptional(1000, 'mainImage'),
  galleryImages:    z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
  highlights:       z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  activities:       z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  tips:             z.array(z.string().trim().min(1).max(500)).max(30).optional(),
})
.passthrough()
.refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided to update',
});

// ---- Public browse query filters ----
export const publicTravelGuidesQuerySchema = z.object({
  destination: z.string().trim().max(120).optional(),
  country:     z.string().trim().max(60).optional(),
  continent:   z.string().trim().max(40).optional(),
  category:    z.string().trim().max(60).optional(),
  minBudget:   z.coerce.number().min(0).optional(),
  maxBudget:   z.coerce.number().min(0).optional(),
  minRating:   z.coerce.number().min(0).max(5).optional(),
  take:        z.coerce.number().int().min(1).max(100).optional(),
  skip:        z.coerce.number().int().min(0).optional(),
  page:        z.coerce.number().int().min(0).optional(),
  size:        z.coerce.number().int().min(1).max(100).optional(),
  sortBy:      z.enum(['createdAt', 'rating', 'budget']).optional().default('createdAt'),
  order:       z.enum(['asc', 'desc']).optional().default('desc'),
})
.strict()
.transform((q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  return {
    destination: q.destination,
    country: q.country,
    continent: q.continent,
    category: q.category,
    minBudget: q.minBudget,
    maxBudget: q.maxBudget,
    minRating: q.minRating,
    sortBy: q.sortBy,
    order: q.order,
    take,
    skip,
  };
});

// ---- Vendor's own list ----
export const listVendorTravelGuidesQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(0).optional(),
  size: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
})
.strict()
.transform((q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  return { sortBy: q.sortBy, order: q.order, take, skip };
});
