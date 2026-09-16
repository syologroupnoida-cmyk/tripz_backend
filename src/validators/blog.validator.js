import { z } from 'zod';

const slugSchema = z.string().trim().min(2).max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must contain lowercase letters, numbers, and hyphens only');

const blogFields = {
  slug: slugSchema,
  title: z.string().trim().min(2).max(250),
  excerpt: z.string().trim().min(2).max(1000),
  category: z.string().trim().min(2).max(100),
  readTime: z.string().trim().min(2).max(50),
  image: z.string().trim().url().max(2000),
  content: z.array(z.string().trim().min(1).max(10000)).min(1).max(100),
  isActive: z.boolean().optional(),
};

export const createBlogSchema = z.object(blogFields)
  .omit({ isActive: true })
  .extend({ slug: slugSchema.optional() })
  .strict();

export const createBlogQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional().default('true'),
}).strict().transform(({ isActive }) => ({ isActive: isActive === 'true' }));

export const updateBlogSchema = z.object(blogFields).partial().strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

export const listBlogsQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional().transform((value) => (
    value === undefined ? undefined : value === 'true'
  )),
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(0).optional(),
  size: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title', 'category']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
}).strict().transform((query) => {
  const take = query.size ?? query.take ?? 20;
  const skip = query.page !== undefined ? query.page * take : (query.skip ?? 0);
  return { ...query, take, skip };
});

export const publicBlogsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(0).optional(),
  size: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['createdAt', 'title', 'category']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
}).strict().transform((query) => {
  const take = query.size ?? query.take ?? 20;
  const skip = query.page !== undefined ? query.page * take : (query.skip ?? 0);
  return { ...query, take, skip };
});
