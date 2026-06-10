import { z } from 'zod';

export const browseLeadsQuerySchema = z
  .object({
    destination: z.string().trim().min(1).max(120).optional(),
    take: z.coerce.number().int().min(1).max(50).optional().default(20),
    skip: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict();
