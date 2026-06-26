import { z } from 'zod';

const trimmedRequired = (min, max, label) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters long`)
    .max(max, `${label} must not exceed ${max} characters`);

const trimmedOptional = (max, label) =>
  z.string().trim().max(max, `${label} must not exceed ${max} characters`).optional();

// ----------------------------------------------------------------------------
//   GET /admin/leads — query params
// ----------------------------------------------------------------------------
//
// Supports:
//   - Filters: status, destination, search, price range, maxUnlocks,
//              unlockCount range, budget range, createdAt / reviewedAt ranges
//   - Pagination: page+size (Spring style) OR take+skip (Prisma style)
//   - Sorting:  sortBy + order
//
// Date params accept ISO-8601 strings (e.g. "2026-06-01" or "2026-06-01T10:00:00Z").
// ----------------------------------------------------------------------------
const isoDate = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date (use ISO-8601, e.g. 2026-06-01)' });

export const listLeadsQuerySchema = z
  .object({
    // ---- Lifecycle / text filters ----
    status: z
      .enum(['PENDING_REVIEW', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REJECTED', 'CLOSED'])
      .optional(),
    destination: z.string().trim().max(120).optional(),
    search: z.string().trim().max(100).optional(),

    // ---- Pricing filters ----
    priceMin: z.coerce.number().int().min(0).max(1000).optional(),
    priceMax: z.coerce.number().int().min(0).max(1000).optional(),
    maxUnlocks: z.coerce.number().int().min(1).max(20).optional(),

    // ---- Unlock-count filters (useful for "leads nobody bought yet") ----
    unlockCountMin: z.coerce.number().int().min(0).optional(),
    unlockCountMax: z.coerce.number().int().min(0).optional(),

    // ---- Customer-budget filters (INR) ----
    budgetMin: z.coerce.number().int().min(0).optional(),
    budgetMax: z.coerce.number().int().min(0).optional(),

    // ---- Date range filters ----
    createdFrom: isoDate.optional(),
    createdTo: isoDate.optional(),
    reviewedFrom: isoDate.optional(),
    reviewedTo: isoDate.optional(),

    // ---- Pagination (dual style) ----
    take: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(0).optional(),
    size: z.coerce.number().int().min(1).max(100).optional(),

    // ---- Sorting ----
    sortBy: z
      .enum(['createdAt', 'updatedAt', 'reviewedAt', 'priceInCredits', 'unlockCount', 'budget'])
      .optional()
      .default('createdAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .strict()
  .transform((q) => {
    const take = q.size ?? q.take ?? 20;
    const skip = q.page !== undefined ? q.page * take : q.skip ?? 0;
    return {
      status: q.status,
      destination: q.destination,
      search: q.search,
      priceMin: q.priceMin,
      priceMax: q.priceMax,
      maxUnlocks: q.maxUnlocks,
      unlockCountMin: q.unlockCountMin,
      unlockCountMax: q.unlockCountMax,
      budgetMin: q.budgetMin,
      budgetMax: q.budgetMax,
      createdFrom: q.createdFrom ? new Date(q.createdFrom) : undefined,
      createdTo: q.createdTo ? new Date(q.createdTo) : undefined,
      reviewedFrom: q.reviewedFrom ? new Date(q.reviewedFrom) : undefined,
      reviewedTo: q.reviewedTo ? new Date(q.reviewedTo) : undefined,
      sortBy: q.sortBy,
      order: q.order,
      take,
      skip,
    };
  });

// ----------------------------------------------------------------------------
//   Shared pricing bounds (used by both status-approve and dedicated pricing endpoints)
// ----------------------------------------------------------------------------
const priceInCreditsField = z.coerce
  .number()
  .int('priceInCredits must be an integer')
  .min(1, 'priceInCredits must be at least 1')
  .max(1000, 'priceInCredits cannot exceed 1000');

const maxUnlocksField = z.coerce
  .number()
  .int('maxUnlocks must be an integer')
  .min(1, 'maxUnlocks must be at least 1')
  .max(20, 'maxUnlocks cannot exceed 20');

// ----------------------------------------------------------------------------
//   PATCH /admin/leads/:id/status — single endpoint for state transitions
// ----------------------------------------------------------------------------
//
//   status: ACTIVE         → approve  (PENDING_REVIEW → ACTIVE).   No reason required.
//                                       Optional priceInCredits / maxUnlocks overrides
//                                       (only honored on the approve transition).
//   status: REJECTED       → reject   (PENDING_REVIEW → REJECTED). Reason REQUIRED (5+ chars).
//   status: CLOSED         → close    (ACTIVE → CLOSED).           Reason optional.
//   status: EXPIRED        → expire   (ACTIVE → EXPIRED).          Reason optional.
//                                       Manual fallback until the auto-expiry cron is built.
//   status: PENDING_REVIEW → revert   (ACTIVE → PENDING_REVIEW).   Reason optional.
//                                       Mistake-undo for accidental approval. Service-layer
//                                       guard: only allowed while unlockCount === 0 (no
//                                       vendor has paid yet). Once any vendor has unlocked,
//                                       the lead is committed and revert is blocked.
//
// The conditional `.refine()` calls enforce:
//   - `reason` required only when rejecting
//   - pricing overrides only allowed when approving
// ----------------------------------------------------------------------------
export const updateLeadStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'REJECTED', 'CLOSED', 'EXPIRED', 'PENDING_REVIEW'], {
      errorMap: (issue) => {
        // Friendlier message — `EXHAUSTED` is still system-managed and
        // intentionally not accepted here.
        if (issue.code === 'invalid_enum_value' && issue.received === 'EXHAUSTED') {
          return {
            message:
              'EXHAUSTED is set automatically when all unlock slots are sold. ' +
              'To remove a lead from the marketplace early, use status: "CLOSED" with a reason.',
          };
        }
        return {
          message:
            'status must be one of: ACTIVE (approve), REJECTED (reject), CLOSED (remove), EXPIRED (travel date passed), or PENDING_REVIEW (undo accidental approval — only before any unlock).',
        };
      },
    }),
    reason: trimmedOptional(500, 'Reason'),
    priceInCredits: priceInCreditsField.optional(),
    maxUnlocks: maxUnlocksField.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.status !== 'REJECTED' ||
      (typeof data.reason === 'string' && data.reason.length >= 5),
    {
      message: 'reason is required (min 5 chars) when status is REJECTED',
      path: ['reason'],
    },
  )
  .refine(
    (data) =>
      data.status === 'ACTIVE' ||
      (data.priceInCredits === undefined && data.maxUnlocks === undefined),
    {
      message: 'priceInCredits and maxUnlocks can only be set when status is ACTIVE (approve)',
      path: ['priceInCredits'],
    },
  );

// ----------------------------------------------------------------------------
//   PATCH /admin/leads/:id/pricing — adjust price / cap on a lead post-approval
// ----------------------------------------------------------------------------
// At least one of priceInCredits / maxUnlocks must be provided.
// Service-layer guards: lead must be PENDING_REVIEW or ACTIVE and unlockCount === 0.
// ----------------------------------------------------------------------------
export const updateLeadPricingSchema = z
  .object({
    priceInCredits: priceInCreditsField.optional(),
    maxUnlocks: maxUnlocksField.optional(),
  })
  .strict()
  .refine(
    (data) => data.priceInCredits !== undefined || data.maxUnlocks !== undefined,
    { message: 'Provide at least one of priceInCredits or maxUnlocks' },
  );
