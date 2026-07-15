import { z } from 'zod';

// Reusable helpers
const trimmedRequired = (min, max, label) =>
  z.string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must not exceed ${max} characters`);

const trimmedOptional = (max, label) =>
  z.string().trim().max(max, `${label} must not exceed ${max} characters`).optional();

export const STORY_TYPES = [
  'FOUNDER_STORY', 'CUSTOMER_STORY', 'VENDOR_STORY',
  'JOURNEY', 'INSPIRATION', 'SUCCESS_STORY',
];

const STORY_STATUSES = ['PUBLISHED', 'HIDDEN'];

// ---- CREATE schema ----
export const createStorySchema = z.object({
  title:             trimmedRequired(2, 200, 'title'),
  storyType:         z.enum(STORY_TYPES, {
    errorMap: () => ({ message: `storyType must be one of: ${STORY_TYPES.join(', ')}` }),
  }),
  authorName:        trimmedRequired(2, 120, 'authorName'),
  authorDesignation: trimmedOptional(120, 'authorDesignation'),
  quote:             trimmedOptional(500, 'quote'),
  shortDescription:  trimmedRequired(2, 500, 'shortDescription'),
  fullStory:         trimmedRequired(2, 20000, 'fullStory'),
  year:              trimmedOptional(10, 'year'),
  location:          trimmedOptional(120, 'location'),

  mainImage:     trimmedRequired(1, 1000, 'mainImage'),
  galleryImages: z.array(z.string().trim().min(1).max(1000)).max(20).optional().default([]),
  keyPoints:     z.array(z.string().trim().min(1).max(300)).max(30).optional().default([]),
  achievements:  z.array(z.string().trim().min(1).max(300)).max(30).optional().default([]),
}).passthrough();

// ---- UPDATE schema ----
export const updateStorySchema = z.object({
  title:             trimmedOptional(200, 'title'),
  storyType:         z.enum(STORY_TYPES).optional(),
  authorName:        trimmedOptional(120, 'authorName'),
  authorDesignation: trimmedOptional(120, 'authorDesignation'),
  quote:             trimmedOptional(500, 'quote'),
  shortDescription:  trimmedOptional(500, 'shortDescription'),
  fullStory:         trimmedOptional(20000, 'fullStory'),
  year:              trimmedOptional(10, 'year'),
  location:          trimmedOptional(120, 'location'),
  mainImage:         trimmedOptional(1000, 'mainImage'),
  galleryImages:     z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
  keyPoints:         z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  achievements:      z.array(z.string().trim().min(1).max(300)).max(30).optional(),
})
.passthrough()
.refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided to update',
});

// ---- Public browse ----
export const publicStoriesQuerySchema = z.object({
  storyType: z.enum(STORY_TYPES).optional(),
  location:  z.string().trim().max(120).optional(),
  year:      z.string().trim().max(10).optional(),
  search:    z.string().trim().max(200).optional(),
  take:      z.coerce.number().int().min(1).max(100).optional(),
  skip:      z.coerce.number().int().min(0).optional(),
  page:      z.coerce.number().int().min(0).optional(),
  size:      z.coerce.number().int().min(1).max(100).optional(),
  sortBy:    z.enum(['createdAt', 'title']).optional().default('createdAt'),
  order:     z.enum(['asc', 'desc']).optional().default('desc'),
})
.strict()
.transform((q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  return {
    storyType: q.storyType,
    location:  q.location,
    year:      q.year,
    search:    q.search,
    sortBy:    q.sortBy,
    order:     q.order,
    take, skip,
  };
});

// ---- My stories (user's own) ----
export const myStoriesQuerySchema = z.object({
  take:  z.coerce.number().int().min(1).max(100).optional(),
  skip:  z.coerce.number().int().min(0).optional(),
  page:  z.coerce.number().int().min(0).optional(),
  size:  z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
})
.strict()
.transform((q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  return { sortBy: q.sortBy, order: q.order, take, skip };
});

// ---- Admin queue query ----
export const adminStoriesQuerySchema = z.object({
  status:       z.enum(STORY_STATUSES).optional(),
  storyType:    z.enum(STORY_TYPES).optional(),
  authorUserId: z.string().trim().max(100).optional(),
  search:       z.string().trim().max(200).optional(),
  take:  z.coerce.number().int().min(1).max(100).optional(),
  skip:  z.coerce.number().int().min(0).optional(),
  page:  z.coerce.number().int().min(0).optional(),
  size:  z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
})
.strict()
.transform((q) => {
  const take = q.size ?? q.take ?? 20;
  const skip = q.page !== undefined ? q.page * take : (q.skip ?? 0);
  return {
    status:       q.status,
    storyType:    q.storyType,
    authorUserId: q.authorUserId,
    search:       q.search,
    sortBy:       q.sortBy,
    order:        q.order,
    take, skip,
  };
});

// ---- Admin hide body ----
// Body is only used when hiding (?hidden=true). Reason is optional even then.
export const hideStorySchema = z.object({
  reason: z.string().trim().min(5).max(500).optional(),
}).passthrough();

// ---- Admin visibility toggle query ----
// PATCH /:id/hide?hidden=true|false — same endpoint for hide + unhide.
// Default = true (hide) to match the URL verb.
export const hideStoryQuerySchema = z.object({
  hidden: z.enum(['true', 'false']).optional().default('true'),
})
.strict()
.transform((q) => ({ hidden: q.hidden === 'true' }));
