import prisma from '../config/db.js';

export const OFFER_INCLUDE = {
  packageTargets: { select: { packageId: true } },
  propertyTargets: { select: { propertyId: true } },
};

const splitTargets = (data) => {
  const { packageIds, propertyIds, ...offer } = data;
  return { offer, packageIds, propertyIds };
};

export const createOffer = async (data) => {
  const { offer, packageIds = [], propertyIds = [] } = splitTargets(data);
  return prisma.offer.create({
    data: {
      ...offer,
      packageTargets: { create: packageIds.map((packageId) => ({ packageId })) },
      propertyTargets: { create: propertyIds.map((propertyId) => ({ propertyId })) },
    },
    include: OFFER_INCLUDE,
  });
};

export const updateOffer = async (id, data) => {
  const { offer, packageIds, propertyIds } = splitTargets(data);
  return prisma.$transaction(async (tx) => {
    if (packageIds !== undefined) {
      await tx.offerPackageTarget.deleteMany({ where: { offerId: id } });
    }
    if (propertyIds !== undefined) {
      await tx.offerPropertyTarget.deleteMany({ where: { offerId: id } });
    }
    return tx.offer.update({
      where: { id },
      data: {
        ...offer,
        ...(packageIds !== undefined
          ? { packageTargets: { create: packageIds.map((packageId) => ({ packageId })) } }
          : {}),
        ...(propertyIds !== undefined
          ? { propertyTargets: { create: propertyIds.map((propertyId) => ({ propertyId })) } }
          : {}),
      },
      include: OFFER_INCLUDE,
    });
  });
};

export const findOfferById = (id) => prisma.offer.findFirst({
  where: { id, deletedAt: null },
  include: OFFER_INCLUDE,
});

export const findOfferByCode = (couponCode, db = prisma) => db.offer.findFirst({
  where: { couponCode, deletedAt: null },
  include: OFFER_INCLUDE,
});

export const listOffers = async ({
  status, discountType, applicableTo, search, take, skip, sortBy, order,
}, { publicOnly = false } = {}) => {
  const where = { deletedAt: null };
  if (publicOnly) {
    const now = new Date();
    where.status = 'ACTIVE';
    where.validTo = { gte: now };
    if (applicableTo) where.applicableTo = { in: [applicableTo, 'BOTH'] };
  } else {
    if (status) where.status = status;
    if (discountType) where.discountType = discountType;
    if (applicableTo) where.applicableTo = applicableTo;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { couponCode: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.offer.findMany({ where, include: OFFER_INCLUDE, take, skip, orderBy: { [sortBy ?? 'createdAt']: order ?? 'desc' } }),
    prisma.offer.count({ where }),
  ]);
  return { items, total };
};

export const softDeleteOffer = (id) => prisma.offer.update({
  where: { id },
  data: { deletedAt: new Date(), status: 'PAUSED' },
  include: OFFER_INCLUDE,
});

export const upsertImportedOffer = (data) => prisma.offer.upsert({
  where: { couponCode: data.couponCode },
  create: data,
  update: { ...data, deletedAt: null },
  include: OFFER_INCLUDE,
});

export const countCompletedBookings = (customerUserId, db = prisma) => db.propertyBooking.count({
  where: { guestUserId: customerUserId, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
});
