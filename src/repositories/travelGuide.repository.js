import prisma from '../config/db.js';

// Public-safe columns (koi vendor internal field expose nahi)
const TRAVEL_GUIDE_SELECT = {
  id: true,
  vendorUserId: true,
  slug: true,
  title: true,
  destination: true,
  country: true,
  continent: true,
  category: true,
  shortDescription: true,
  description: true,
  bestTimeToVisit: true,
  duration: true,
  budget: true,
  currency: true,
  rating: true,
  weather: true,
  language: true,
  visaRequired: true,
  transportation: true,
  accommodation: true,
  cuisine: true,
  safetyRating: true,
  mainImage: true,
  galleryImages: true,
  highlights: true,
  activities: true,
  tips: true,
  createdAt: true,
  updatedAt: true,
};

export const createTravelGuide = async (data) => {
  return prisma.travelGuide.create({
    data,
    select: TRAVEL_GUIDE_SELECT,
  });
};

// Slug uniqueness check (soft-deleted rows bhi include)
export const getGuideBySlug = async (slug) => {
  return prisma.travelGuide.findUnique({
    where: { slug },
    select: { id: true, slug: true, deletedAt: true },
  });
};

// Fetch by id — soft-deleted skip
export const getGuideById = async (id) => {
  return prisma.travelGuide.findFirst({
    where: { id, deletedAt: null },
    select: TRAVEL_GUIDE_SELECT,
  });
};

// Public detail by slug (SEO URL support)
export const getGuideBySlugPublic = async (slug) => {
  return prisma.travelGuide.findFirst({
    where: { slug, deletedAt: null },
    select: TRAVEL_GUIDE_SELECT,
  });
};

export const updateGuide = async (id, data) => {
  return prisma.travelGuide.update({
    where: { id },
    data,
    select: TRAVEL_GUIDE_SELECT,
  });
};

// Soft delete — deletedAt stamp
export const softDeleteGuide = async ({ id, vendorUserId }) => {
  const result = await prisma.travelGuide.updateMany({
    where: { id, vendorUserId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count === 1;
};

// Vendor's own guides list
export const listGuidesForVendor = async ({ vendorUserId, sortBy, order, take, skip }) => {
  const where = { vendorUserId, deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.travelGuide.findMany({
      where,
      orderBy: { [sortBy]: order },
      take, skip,
      select: TRAVEL_GUIDE_SELECT,
    }),
    prisma.travelGuide.count({ where }),
  ]);
  return { items, total };
};

// Public browse with filters
export const listGuidesPublic = async ({
  destination, country, continent, category,
  minBudget, maxBudget, minRating,
  sortBy, order, take, skip,
}) => {
  const where = { deletedAt: null };
  if (destination) where.destination = { contains: destination, mode: 'insensitive' };
  if (country) where.country = { contains: country, mode: 'insensitive' };
  if (continent) where.continent = { contains: continent, mode: 'insensitive' };
  if (category) where.category = { contains: category, mode: 'insensitive' };
  if (minBudget !== undefined || maxBudget !== undefined) {
    where.budget = {};
    if (minBudget !== undefined) where.budget.gte = minBudget;
    if (maxBudget !== undefined) where.budget.lte = maxBudget;
  }
  if (minRating !== undefined) where.rating = { gte: minRating };

  const [items, total] = await Promise.all([
    prisma.travelGuide.findMany({
      where, orderBy: { [sortBy]: order }, take, skip,
      select: TRAVEL_GUIDE_SELECT,
    }),
    prisma.travelGuide.count({ where }),
  ]);
  return { items, total };
};
