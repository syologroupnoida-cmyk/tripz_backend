import { z } from 'zod';

// Query schema for GET /api/v1/client/leads (customer's own inquiries).
export const listMyLeadsQuerySchema = z
  .object({
    take: z.coerce.number().int().min(1).max(50).optional().default(20),
    skip: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict();
