import { z } from 'zod';

export const browseLeadsQuerySchema = z
  .object({
    destination: z.string().trim().min(1).max(120).optional(),
    // Dual-style pagination — same pattern as adminLead/vendorManagement.
    take: z.coerce.number().int().min(1).max(50).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(0).optional(),
    size: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict()
  .transform((q) => {
    const take = q.size ?? q.take ?? 20;
    const skip = q.page !== undefined ? q.page * take : q.skip ?? 0;
    return { destination: q.destination, take, skip };
  });
