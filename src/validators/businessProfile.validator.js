import { z } from 'zod';

const boolFromString = z.union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

const pagination = {
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(20),
};

export const listBusinessProfilesQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  location: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  isActive: boolFromString.optional(),
  sortBy: z.enum(['companyName', 'rating', 'reviewCount', 'createdAt']).default('companyName'),
  order: z.enum(['asc', 'desc']).default('asc'),
  ...pagination,
}).transform(({ page, size, ...query }) => ({ ...query, take: size, skip: page * size }));

export const updateBusinessProfileSchema = z.object({
  companyName: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(120).nullable().optional(),
  website: z.string().trim().url().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  emails: z.array(z.string().trim().email()).max(3).optional(),
  address: z.string().trim().max(1000).nullable().optional(),
  location: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
  pincode: z.string().trim().max(20).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().nonnegative().nullable().optional(),
  googleMapsUrl: z.string().trim().url().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required.' });
