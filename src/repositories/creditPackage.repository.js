import prisma from '../config/db.js';

const SELECT = {
  id: true, name: true, description: true, credits: true,
  salePriceInPaise: true, offerPriceInPaise: true,
  isFeatured: true, displayOrder: true, isActive: true, deletedAt: true,
  createdAt: true, updatedAt: true,
};

export const create = (data) => prisma.creditPackage.create({ data, select: SELECT });

export const findById = (id, { includeDeleted = false } = {}) =>
  prisma.creditPackage.findFirst({
    where: { id, ...(!includeDeleted ? { deletedAt: null } : {}) },
    select: SELECT,
  });

export const update = (id, data) =>
  prisma.creditPackage.update({ where: { id }, data, select: SELECT });

export const softDelete = (id) =>
  prisma.creditPackage.update({
    where: { id }, data: { deletedAt: new Date(), isActive: false }, select: SELECT,
  });

export const listForAdmin = async ({ isActive, includeDeleted, take, skip }) => {
  const where = {};
  if (typeof isActive === 'boolean') where.isActive = isActive;
  if (!includeDeleted) where.deletedAt = null;
  const [items, total] = await Promise.all([
    prisma.creditPackage.findMany({
      where, take, skip, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }], select: SELECT,
    }),
    prisma.creditPackage.count({ where }),
  ]);
  return { items, total };
};

export const listActive = () => prisma.creditPackage.findMany({
  where: { isActive: true, deletedAt: null },
  orderBy: [{ displayOrder: 'asc' }, { offerPriceInPaise: 'asc' }],
  select: SELECT,
});
