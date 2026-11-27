import prisma from '../config/db.js';

const PUBLIC_SELECT = {
  id: true,
  keyword: true,
  location: true,
  companyName: true,
  category: true,
  website: true,
  phone: true,
  emails: true,
  address: true,
  city: true,
  state: true,
  pincode: true,
  rating: true,
  reviewCount: true,
  googleMapsUrl: true,
  createdAt: true,
  updatedAt: true,
};

const buildWhere = ({ search, location, city, state, category, minRating, isActive }, publicOnly) => {
  const where = { deletedAt: null };
  if (publicOnly) where.isActive = true;
  else if (isActive !== undefined) where.isActive = isActive;
  if (location) where.location = { equals: location, mode: 'insensitive' };
  if (city) where.city = { equals: city, mode: 'insensitive' };
  if (state) where.state = { equals: state, mode: 'insensitive' };
  if (category) where.category = { equals: category, mode: 'insensitive' };
  if (minRating !== undefined) where.rating = { gte: minRating };
  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { state: { contains: search, mode: 'insensitive' } },
    ];
  }
  return where;
};

export const listBusinessProfiles = async (query, { publicOnly = false } = {}) => {
  const where = buildWhere(query, publicOnly);
  const [items, total] = await Promise.all([
    prisma.businessProfile.findMany({
      where,
      take: query.take,
      skip: query.skip,
      orderBy: { [query.sortBy]: query.order },
      ...(publicOnly ? { select: PUBLIC_SELECT } : {}),
    }),
    prisma.businessProfile.count({ where }),
  ]);
  return { items, total };
};

export const findBusinessProfileById = (id, { publicOnly = false } = {}) =>
  prisma.businessProfile.findFirst({
    where: { id, deletedAt: null, ...(publicOnly ? { isActive: true } : {}) },
    ...(publicOnly ? { select: PUBLIC_SELECT } : {}),
  });

export const importBusinessProfiles = (rows) => prisma.businessProfile.createMany({
  data: rows,
  skipDuplicates: true,
});

export const updateBusinessProfile = (id, data) => prisma.businessProfile.update({
  where: { id },
  data,
});

export const deleteBusinessProfile = (id) => prisma.businessProfile.update({
  where: { id },
  data: { deletedAt: new Date(), isActive: false },
});
