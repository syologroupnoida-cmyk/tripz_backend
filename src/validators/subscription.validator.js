import { z } from 'zod';

// Common building blocks -------------------------------------------------------

const trimmedRequired = (min, max, label) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters long`)
    .max(max, `${label} must not exceed ${max} characters`);

const trimmedOptional = (max, label) =>
  z.string().trim().max(max, `${label} must not exceed ${max} characters`).optional();

// "true"/"false" → boolean, undefined stays undefined.
const stringBool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

// -1 = unlimited; otherwise positive integer ≤ 1000.
const maxPackagesField = z
  .number({ required_error: 'maxPackages is required' })
  .int('maxPackages must be an integer')
  .refine((v) => v === -1 || (v >= 1 && v <= 1000), {
    message: 'maxPackages must be -1 (unlimited) or between 1 and 1000',
  });

// Paise field — INR × 100. Cap at ₹10 lakh (100000000 paise).
const paiseField = (label) =>
  z
    .number({ required_error: `${label} is required` })
    .int(`${label} must be an integer`)
    .min(0, `${label} cannot be negative`)
    .max(100000000, `${label} exceeds allowed limit`);

// Display content JSONB — documented shape, not strictly enforced so admin can
// iterate freely. We do validate the outer object + feature array structure to
// catch obvious typos.
const featureItemSchema = z.object({
  text: z.string().trim().min(1).max(200),
  included: z.boolean().default(true),
});

// Base shape — reused by both create (default {}) and update (plain optional).
// Defined without `.optional().default(...)` so we can wrap it differently per
// context without hitting Zod's ZodDefault/ZodOptional unwrap limitations.
const displayContentInnerSchema = z
  .object({
    badgeText: z.string().trim().max(40).optional(),
    ribbonText: z.string().trim().max(40).optional().nullable(),
    iconUrl: z.string().trim().max(500).optional(),
    themeColor: z
      .string()
      .trim()
      .regex(/^#([0-9A-Fa-f]{3}){1,2}$/, 'themeColor must be a hex color (#RRGGBB)')
      .optional(),
    ctaButtonText: z.string().trim().max(40).optional(),
    features: z.array(featureItemSchema).max(20).optional(),
  })
  .passthrough(); // allow future fields without a validator change

// -----------------------------------------------------------------------------
//   Rules — future-flex JSONB for plan-level feature flags.
// -----------------------------------------------------------------------------
// Reserved for policies the backend will honour later without a migration —
// things like `emailNotificationsEnabled`, `smsNotificationsEnabled`,
// `analyticsAccess`, etc. Formalise a key in this schema only when the code
// that actually reads it lands, otherwise it's silent dead weight.
//
// Right now no keys are declared, so `.passthrough()` accepts an empty object
// or any future admin-set flags without rejecting them. Lead pricing is NOT
// stored here:
//   • Marketplace leads use `Lead.priceInCredits` (uniform 10 credits).
//   • Direct package leads use `SubscriptionPlan.directLeadPriceCredits`.
const knownRulesSchema = z.object({}).passthrough();

// -----------------------------------------------------------------------------
//   POST /super-admin/subscription-plans — create plan
// -----------------------------------------------------------------------------
export const createPlanSchema = z
  .object({
    // ---- Core identity ----
    name: trimmedRequired(2, 60, 'name'),
    description: trimmedRequired(2, 500, 'description'),

    // ---- Pricing ----
    salePriceInPaise: paiseField('salePriceInPaise'),
    offerPriceInPaise: paiseField('offerPriceInPaise'),
    billingCycle: z
      .enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'])
      .optional()
      .default('MONTHLY'),
    durationDays: z
      .number({ required_error: 'durationDays is required' })
      .int('durationDays must be an integer')
      .min(1, 'durationDays must be at least 1')
      .max(3650, 'durationDays cannot exceed 10 years'),
    trialDays: z.number().int().min(0).max(365).optional().default(0),

    // ---- Backend business logic ----
    includedCredits: z
      .number()
      .int('includedCredits must be an integer')
      .min(0, 'includedCredits cannot be negative')
      .max(1000000, 'includedCredits too large')
      .optional()
      .default(0),
    maxPackages: maxPackagesField,
    directLeadPriceCredits: z
      .number()
      .int('directLeadPriceCredits must be an integer')
      .min(0)
      .max(1000)
      .optional()
      .default(5),
    priorityWeight: z
      .number()
      .int('priorityWeight must be an integer')
      .min(0)
      .max(1000)
      .optional()
      .default(0),

    // ---- Display flags ----
    isFeatured: z.boolean().optional().default(false),
    displayOrder: z.number().int().min(0).max(100).optional().default(0),
    isActive: z.boolean().optional().default(true),

    // ---- Frontend content ----
    displayContent: displayContentInnerSchema.optional().default({}),

    // ---- Plan-level policy rules (backend enforces) ----
    rules: knownRulesSchema.optional().default({}),
  })
  .strict()
  .refine((data) => data.offerPriceInPaise <= data.salePriceInPaise, {
    message: 'offerPriceInPaise must be less than or equal to salePriceInPaise',
    path: ['offerPriceInPaise'],
  });

// -----------------------------------------------------------------------------
//   PATCH /super-admin/subscription-plans/:id — update plan
// -----------------------------------------------------------------------------
// Every field optional. Only supplied keys are updated. Cross-field constraint
// (offer <= sale) is validated only when both values are supplied.
export const updatePlanSchema = z
  .object({
    name: trimmedOptional(60, 'name'),
    description: trimmedOptional(500, 'description'),

    salePriceInPaise: z.number().int().min(0).max(100000000).optional(),
    offerPriceInPaise: z.number().int().min(0).max(100000000).optional(),
    billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']).optional(),
    durationDays: z.number().int().min(1).max(3650).optional(),
    trialDays: z.number().int().min(0).max(365).optional(),

    includedCredits: z.number().int().min(0).max(1000000).optional(),
    maxPackages: z
      .number()
      .int()
      .refine((v) => v === -1 || (v >= 1 && v <= 1000), {
        message: 'maxPackages must be -1 (unlimited) or between 1 and 1000',
      })
      .optional(),
    directLeadPriceCredits: z.number().int().min(0).max(1000).optional(),
    priorityWeight: z.number().int().min(0).max(1000).optional(),

    isFeatured: z.boolean().optional(),
    displayOrder: z.number().int().min(0).max(100).optional(),
    isActive: z.boolean().optional(),

    displayContent: displayContentInnerSchema.optional(),
    rules: knownRulesSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  })
  .refine(
    (data) => {
      // Only enforce the price cross-check when both are supplied in the same
      // update. A partial patch that only touches offer or sale is fine.
      if (data.offerPriceInPaise !== undefined && data.salePriceInPaise !== undefined) {
        return data.offerPriceInPaise <= data.salePriceInPaise;
      }
      return true;
    },
    {
      message: 'offerPriceInPaise must be less than or equal to salePriceInPaise',
      path: ['offerPriceInPaise'],
    },
  );

// -----------------------------------------------------------------------------
//   GET /admin/subscription-plans — list plans (admin view)
// -----------------------------------------------------------------------------
export const listPlansQuerySchema = z
  .object({
    isActive: stringBool,
    // ?includeDeleted=true — audit view; default hides soft-deleted plans.
    includeDeleted: stringBool,
    take: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(0).optional(),
    size: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z
      .enum([
        'createdAt',
        'updatedAt',
        'name',
        'offerPriceInPaise',
        'salePriceInPaise',
        'durationDays',
        'displayOrder',
      ])
      .optional()
      .default('displayOrder'),
    order: z.enum(['asc', 'desc']).optional().default('asc'),
  })
  .strict()
  .transform((q) => {
    const take = q.size ?? q.take ?? 20;
    const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
    return {
      isActive: q.isActive,
      includeDeleted: q.includeDeleted ?? false,
      sortBy: q.sortBy,
      order: q.order,
      take,
      skip,
    };
  });

// -----------------------------------------------------------------------------
//   DELETE /super-admin/subscription-plans/:id — soft delete
// -----------------------------------------------------------------------------
// Reason is optional. Delete is a lower-stakes action than force-cancelling
// a live vendor subscription — existing subs keep running to their natural
// expiry, only the catalog entry is retired.
export const deletePlanSchema = z
  .object({
    reason: trimmedOptional(500, 'reason'),
  })
  .strict()
  .optional()
  .default({});

// -----------------------------------------------------------------------------
//   GET /admin/subscriptions — list all vendor subscriptions
// -----------------------------------------------------------------------------
export const listSubscriptionsQuerySchema = z
  .object({
    status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED', 'UPGRADED']).optional(),
    planId: z.string().uuid().optional(),
    vendorUserId: z.string().uuid().optional(),
    take: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(0).optional(),
    size: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z
      .enum(['createdAt', 'expiresAt', 'startsAt'])
      .optional()
      .default('createdAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .strict()
  .transform((q) => {
    const take = q.size ?? q.take ?? 20;
    const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
    return {
      status: q.status,
      planId: q.planId,
      vendorUserId: q.vendorUserId,
      sortBy: q.sortBy,
      order: q.order,
      take,
      skip,
    };
  });

// -----------------------------------------------------------------------------
//   POST /admin/subscriptions/:id/cancel — force-cancel a vendor sub
// -----------------------------------------------------------------------------
// Reason is REQUIRED — force-cancellation should always have an audit note.
export const cancelSubscriptionSchema = z
  .object({
    reason: trimmedRequired(5, 500, 'reason'),
  })
  .strict();

// -----------------------------------------------------------------------------
//   POST /vendor/subscriptions — buy a plan
//   POST /vendor/subscriptions/upgrade — upgrade to a higher plan
// -----------------------------------------------------------------------------
export const buySubscriptionSchema = z
  .object({
    planId: z
      .string({ required_error: 'planId is required' })
      .uuid('planId must be a valid UUID'),
  })
  .strict();

export const upgradeSubscriptionSchema = z
  .object({
    planId: z
      .string({ required_error: 'planId is required' })
      .uuid('planId must be a valid UUID'),
  })
  .strict();

// -----------------------------------------------------------------------------
//   GET /vendor/subscriptions/history — paginated own history
// -----------------------------------------------------------------------------
export const vendorSubscriptionHistoryQuerySchema = z
  .object({
    take: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(0).optional(),
    size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()
  .transform((q) => {
    const take = q.size ?? q.take ?? 20;
    const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
    return { take, skip };
  });
