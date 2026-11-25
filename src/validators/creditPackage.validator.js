import { z } from 'zod';

const fields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  credits: z.number().int().min(1).max(1000000),
  salePriceInPaise: z.number().int().min(1).max(100000000),
  offerPriceInPaise: z.number().int().min(1).max(100000000),
  isFeatured: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
};

export const createCreditPackageSchema = z.object(fields).strict().refine(
  (data) => data.offerPriceInPaise <= data.salePriceInPaise,
  { path: ['offerPriceInPaise'], message: 'offerPriceInPaise cannot exceed salePriceInPaise' },
);

export const updateCreditPackageSchema = z.object({
  name: fields.name.optional(), description: fields.description,
  credits: fields.credits.optional(), salePriceInPaise: fields.salePriceInPaise.optional(),
  offerPriceInPaise: fields.offerPriceInPaise.optional(),
  isFeatured: fields.isFeatured, displayOrder: fields.displayOrder, isActive: fields.isActive,
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required.',
});

const queryBoolean = z.enum(['true', 'false']).optional()
  .transform((value) => value === undefined ? undefined : value === 'true');

export const listCreditPackagesSchema = z.object({
  isActive: queryBoolean,
  includeDeleted: queryBoolean,
  page: z.coerce.number().int().min(0).optional(),
  size: z.coerce.number().int().min(1).max(100).optional(),
}).strict().transform((query) => {
  const take = query.size ?? 20;
  return {
    isActive: query.isActive,
    includeDeleted: query.includeDeleted ?? false,
    take,
    skip: (query.page ?? 0) * take,
  };
});
