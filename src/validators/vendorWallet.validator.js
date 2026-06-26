import { z } from 'zod';

const WALLET_TRANSACTION_TYPES = [
  'DEBIT_LEAD_UNLOCK',
  'CREDIT_TOP_UP',
  'CREDIT_REFUND',
  'CREDIT_ADMIN_ADJUSTMENT',
  'DEBIT_ADMIN_ADJUSTMENT',
];

// ----------------------------------------------------------------------------
//   GET /vendor/wallet/transactions
// ----------------------------------------------------------------------------
export const listTransactionsQuerySchema = z
  .object({
    type: z.enum(WALLET_TRANSACTION_TYPES).optional(),
    take: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(0).optional(),
    size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()
  .transform((q) => {
    const take = q.size ?? q.take ?? 20;
    const skip = q.page !== undefined ? q.page * take : q.skip ?? 0;
    return { type: q.type, take, skip };
  });
