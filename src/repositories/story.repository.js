import prisma from '../config/db.js';

const STORY_SELECT = {
  id: true,
  authorUserId: true,
  slug: true,
  title: true,
  storyType: true,
  authorName: true,
  authorDesignation: true,
  quote: true,
  shortDescription: true,
  fullStory: true,
  year: true,
  location: true,
  mainImage: true,
  galleryImages: true,
  keyPoints: true,
  achievements: true,
  status: true,
  hiddenReason: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: { id: true, role: true, firstName: true, lastName: true, avatarUrl: true },
  },
};

export const createStory = async (data) => {
  return prisma.story.create({
    data,
    select: STORY_SELECT,
  });
};

export const getStoryBySlug = async (slug) => {
  return prisma.story.findUnique({
    where: { slug },
    select: { id: true, slug: true, deletedAt: true },
  });
};

export const getStoryById = async (id) => {
  return prisma.story.findFirst({
    where: { id, deletedAt: null },
    select: STORY_SELECT,
  });
};

export const getStoryBySlugPublic = async (slug) => {
  return prisma.story.findFirst({
    where: { slug, deletedAt: null, status: 'PUBLISHED' },
    select: STORY_SELECT,
  });
};

export const updateStory = async (id, data) => {
  return prisma.story.update({
    where: { id },
    data,
    select: STORY_SELECT,
  });
};

// User deletes own story — ownership enforced via where clause
export const softDeleteOwnStory = async ({ id, authorUserId }) => {
  const result = await prisma.story.updateMany({
    where: { id, authorUserId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count === 1;
};

// Admin deletes any story — no ownership check
export const adminSoftDeleteStory = async ({ id }) => {
  const result = await prisma.story.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count === 1;
};

// Toggle status (PUBLISHED <-> HIDDEN)
export const setStoryStatus = async ({ id, status, hiddenReason = null }) => {
  return prisma.story.update({
    where: { id },
    data: {
      status,
      hiddenReason: status === 'HIDDEN' ? hiddenReason : null,
    },
    select: STORY_SELECT,
  });
};

export const listMyStories = async ({ authorUserId, sortBy, order, take, skip }) => {
  const where = { authorUserId, deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.story.findMany({
      where,
      orderBy: { [sortBy]: order },
      take, skip,
      select: STORY_SELECT,
    }),
    prisma.story.count({ where }),
  ]);
  return { items, total };
};

export const listStoriesPublic = async ({
  storyType, location, year, search,
  sortBy, order, take, skip,
}) => {
  const where = { deletedAt: null, status: 'PUBLISHED' };
  if (storyType) where.storyType = storyType;
  if (location) where.location = { contains: location, mode: 'insensitive' };
  if (year) where.year = year;
  if (search) where.title = { contains: search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.story.findMany({
      where,
      orderBy: { [sortBy]: order },
      take, skip,
      select: STORY_SELECT,
    }),
    prisma.story.count({ where }),
  ]);
  return { items, total };
};

export const listStoriesForAdmin = async ({
  status, storyType, authorUserId, search,
  sortBy, order, take, skip,
}) => {
  const where = { deletedAt: null };
  if (status) where.status = status;
  if (storyType) where.storyType = storyType;
  if (authorUserId) where.authorUserId = authorUserId;
  if (search) where.title = { contains: search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.story.findMany({
      where,
      orderBy: { [sortBy]: order },
      take, skip,
      select: STORY_SELECT,
    }),
    prisma.story.count({ where }),
  ]);
  return { items, total };
};
