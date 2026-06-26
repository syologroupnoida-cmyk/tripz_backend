import { z } from 'zod';

// Query schema for GET /api/v1/client/leads (customer's own inquiries).
// Dual-style pagination — same pattern as adminLead/vendorManagement.
export const listMyLeadsQuerySchema = z
  .object({
    take: z.coerce.number().int().min(1).max(50).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(0).optional(),
    size: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict()
  .transform((q) => {
    const take = q.size ?? q.take ?? 20;
    const skip = q.page !== undefined ? q.page * take : q.skip ?? 0;
    return { take, skip };
  });
