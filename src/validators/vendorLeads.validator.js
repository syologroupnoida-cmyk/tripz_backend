import { z } from 'zod';

// ----------------------------------------------------------------------------
//   GET /vendor/leads/unlocked
// ----------------------------------------------------------------------------
export const listUnlockedLeadsQuerySchema = z
  .object({
    take: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(0).optional(),
    size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()
  .transform((q) => {
    const take = q.size ?? q.take ?? 20;
    const skip = q.page !== undefined ? q.page * take : q.skip ?? 0;
    return { take, skip };
  });
