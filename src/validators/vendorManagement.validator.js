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
// ----------------------------------------------------------------------------
export const listVendorsQuerySchema = z
  .object({
    kycStatus: z.enum(['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED']).optional(),
    isActive: stringBool,
    search: z.string().trim().max(100).optional(),
    take: z.coerce.number().int().min(1).max(100).optional().default(20),
    skip: z.coerce.number().int().min(0).optional().default(0),
    sortBy: z.enum(['createdAt', 'updatedAt', 'name']).optional().default('createdAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .strict();

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
