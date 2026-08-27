import { z } from 'zod';

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

// ----------------------------------------------------------------------------
//   GET /admin/vendors  query params
//
// Accepts BOTH pagination styles so frontend devs can use whichever they
// prefer. Both produce the same DB query:
//   - Offset-based:  ?take=10&skip=0     (Prisma-native, matches other endpoints)
//   - Page-based:    ?page=0&size=10     (Spring Boot / Spring Data style, 0-indexed)
//
// Internally we normalize to { take, skip } via a transform — repository and
// service code only ever see take/skip.
// ----------------------------------------------------------------------------
export const listVendorsQuerySchema = z
  .object({
    kycStatus: z.enum(['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED']).optional(),
    isActive: stringBool,
    // ?wallet=true → include each vendor's current credit balance in the response.
    wallet: stringBool,
    search: z.string().trim().max(100).optional(),
    // Offset-based (Prisma-native)
    take: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    // Page-based (frontend-friendly alternative). 0-indexed: page=0 is first page.
    page: z.coerce.number().int().min(0).optional(),
    size: z.coerce.number().int().min(1).max(200).optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'name']).optional().default('createdAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .strict()
  .transform((q) => {
    // Normalize: page+size wins if both are provided; otherwise fall back to
    // take/skip, otherwise defaults (20 per page, first page).
    const take = q.size ?? q.take ?? 20;
    const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
    return {
      kycStatus: q.kycStatus,
      isActive: q.isActive,
      wallet: q.wallet ?? false,
      search: q.search,
      sortBy: q.sortBy,
      order: q.order,
      take,
      skip,
    };
  });

// ----------------------------------------------------------------------------
//   POST /super-admin/vendors/:userId/activate
// ----------------------------------------------------------------------------
// Reason is optional — activation is the "good" action.
export const activateVendorSchema = z
  .object({
    reason: trimmedOptional(500, 'Reason'),
  })
  .strict();

// ----------------------------------------------------------------------------
//   POST /super-admin/vendors/:userId/deactivate
// ----------------------------------------------------------------------------
// Reason is REQUIRED — deactivation must always have a documented cause.
export const deactivateVendorSchema = z
  .object({
    reason: trimmedRequired(5, 500, 'Reason'),
  })
  .strict();

// ----------------------------------------------------------------------------
//   POST /super-admin/vendors/:userId/credits/grant
//   POST /super-admin/vendors/:userId/credits/revoke
// ----------------------------------------------------------------------------
// Both use a positive integer amount. Notes are optional on grant, required
// on revoke (so we always know why credits were clawed back).
const amountField = z
  .number({ required_error: 'amount is required' })
  .int('amount must be an integer')
  .positive('amount must be greater than zero')
  .max(100000, 'amount is too large');

export const grantCreditsSchema = z
  .object({
    amount: amountField,
    notes: trimmedOptional(500, 'Notes'),
  })
  .strict();

export const revokeCreditsSchema = z
  .object({
    amount: amountField,
    notes: trimmedRequired(5, 500, 'Notes'),
  })
  .strict();
