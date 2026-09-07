import prisma from '../config/db.js';

// -----------------------------------------------------------------------------
//   PACKAGE — full column select (used everywhere for consistency)
// -----------------------------------------------------------------------------
const PACKAGE_SELECT = {
  id: true,
  vendorUserId: true,
  slug: true,

  title: true,
  agencyName: true,
  departureCity: true,
  destination: true,
  route: true,
  duration: true,
  overview: true,
  otherDetails: true,
  cancellationPolicy: true,

  packageRegion: true,
  packageType: true,
  validityType: true,

  startDate: true,
  endDate: true,

  priceInPaise: true,
  oldPriceInPaise: true,
  discountPercent: true,

  hotelCategory: true,
  transfers: true,
  meals: true,
  sightseeing: true,

  mainImageUrl: true,
  galleryImageUrls: true,

  highlights: true,
  inclusions: true,
  exclusions: true,
  itinerary: true,

  offerTitle: true,
  offerDescription: true,

  status: true,
  hasPendingReview: true,

  submittedAt: true,
  reviewedAt: true,
  reviewedByAdminId: true,
  rejectionReason: true,

  deletedAt: true,
  createdAt: true,
  updatedAt: true,
};

// Slightly richer select used by admin detail — includes owning vendor's user info.
const ADMIN_PACKAGE_SELECT = {
  ...PACKAGE_SELECT,
  vendor: {
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  },
};

// -----------------------------------------------------------------------------
//   CREATE / READ
// -----------------------------------------------------------------------------

export const createPackage = async (data) => {
  return prisma.package.create({
    data,
    select: PACKAGE_SELECT,
  });
};

export const getPackageBySlug = async (slug) => {
  return prisma.package.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });
};

export const getPackageById = async (id, { includeDeleted = false } = {}) => {
  const where = { id };
  if (!includeDeleted) where.deletedAt = null;
  return prisma.package.findFirst({
    where,
    select: PACKAGE_SELECT,
  });
};

export const getPackageBySlugPublic = async (slug) => {
  return prisma.package.findFirst({
    where: { slug, deletedAt: null, status: 'APPROVED' },
    select: PACKAGE_SELECT,
  });
};

// Ownership check without loading the whole row.
export const getPackageOwnership = async (id) => {
  return prisma.package.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, vendorUserId: true, status: true, slug: true },
  });
};

// -----------------------------------------------------------------------------
//   UPDATE — plain patch (state machine transitions live in the service)
// -----------------------------------------------------------------------------
export const updatePackage = async (id, data) => {
  return prisma.package.update({
    where: { id },
    data,
    select: PACKAGE_SELECT,
  });
};

// -----------------------------------------------------------------------------
//   Vendor-side listing
// -----------------------------------------------------------------------------
export const countVendorActivePackages = async (vendorUserId) => {
  // "Active" = anything the vendor is currently paying for — DRAFT + SUBMITTED
  // + APPROVED + PAUSED counts against plan.maxPackages. REJECTED and soft
  // deleted don't consume a slot.
  return prisma.package.count({
    where: {
      vendorUserId,
      deletedAt: null,
      status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAUSED'] },
    },
  });
};

export const listPackagesForVendor = async ({
  vendorUserId,
  status,
  departureCity,
  destination,
  sortBy,
  order,
  take,
  skip,
}) => {
  const where = { vendorUserId, deletedAt: null };
  if (status) where.status = status;
  if (departureCity) where.departureCity = { contains: departureCity, mode: 'insensitive' };
  if (destination) where.destination = { contains: destination, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.package.findMany({
      where,
      orderBy: { [sortBy]: order },
      take,
      skip,
      select: PACKAGE_SELECT,
    }),
    prisma.package.count({ where }),
  ]);

  return { items, total };
};

// -----------------------------------------------------------------------------
//   Admin-side listing
// -----------------------------------------------------------------------------
export const listPackagesForAdmin = async ({
  status,
  hasPendingReview,
  vendorUserId,
  agencyName,
  departureCity,
  destination,
  packageRegion,
  packageType,
  validityType,
  duration,
  hotelCategory,
  search,
  minPriceInPaise,
  maxPriceInPaise,
  createdFrom,
  createdTo,
  submittedFrom,
  submittedTo,
  activeOn,
  validFrom,
  validTo,
  sortBy,
  order,
  take,
  skip,
}) => {
  const where = { deletedAt: null };

  // Lifecycle + workflow
  if (status) where.status = status;
  if (typeof hasPendingReview === 'boolean') where.hasPendingReview = hasPendingReview;

  // Ownership
  if (vendorUserId) where.vendorUserId = vendorUserId;
  if (agencyName) where.agencyName = { contains: agencyName, mode: 'insensitive' };

  // Enum filters
  if (packageRegion) where.packageRegion = packageRegion;
  if (packageType) where.packageType = packageType;
  if (validityType) where.validityType = validityType;

  // Free-text contains filters
  if (departureCity) where.departureCity = { contains: departureCity, mode: 'insensitive' };
  if (destination) where.destination = { contains: destination, mode: 'insensitive' };
  if (duration) where.duration = { contains: duration, mode: 'insensitive' };
  if (hotelCategory) where.hotelCategory = { contains: hotelCategory, mode: 'insensitive' };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { overview: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Price range
  if (minPriceInPaise !== undefined || maxPriceInPaise !== undefined) {
    where.priceInPaise = {};
    if (minPriceInPaise !== undefined) where.priceInPaise.gte = minPriceInPaise;
    if (maxPriceInPaise !== undefined) where.priceInPaise.lte = maxPriceInPaise;
  }

  // Timestamp ranges
  if (createdFrom || createdTo) {
    where.createdAt = {};
    if (createdFrom) where.createdAt.gte = createdFrom;
    if (createdTo) where.createdAt.lte = createdTo;
  }
  if (submittedFrom || submittedTo) {
    where.submittedAt = {};
    if (submittedFrom) where.submittedAt.gte = submittedFrom;
    if (submittedTo) where.submittedAt.lte = submittedTo;
  }

  // Seasonal validity window filters
  //   activeOn — package's window contains this single date
  //   validFrom / validTo — window falls entirely within this range
  if (activeOn) {
    where.startDate = { lte: activeOn };
    where.endDate = { gte: activeOn };
  }
  if (validFrom) where.startDate = { ...(where.startDate ?? {}), gte: validFrom };
  if (validTo) where.endDate = { ...(where.endDate ?? {}), lte: validTo };

  const [items, total] = await Promise.all([
    prisma.package.findMany({
      where,
      orderBy: { [sortBy]: order },
      take,
      skip,
      select: ADMIN_PACKAGE_SELECT,
    }),
    prisma.package.count({ where }),
  ]);

  return { items, total };
};

export const getPackageByIdForAdmin = async (id) => {
  return prisma.package.findFirst({
    where: { id, deletedAt: null },
    select: ADMIN_PACKAGE_SELECT,
  });
};

// -----------------------------------------------------------------------------
//   Public marketplace listing — APPROVED only, not expired
// -----------------------------------------------------------------------------
export const listPackagesPublic = async ({
  departureCity,
  destination,
  packageRegion,
  packageType,
  validityType,
  duration,
  hotelCategory,
  minPriceInPaise,
  maxPriceInPaise,
  sortBy,
  order,
  take,
  skip,
}) => {
  const now = new Date();

  const where = {
    deletedAt: null,
    status: 'APPROVED',
    OR: [
      // Evergreen packages: always shown
      { validityType: 'EVERGREEN' },
      // Seasonal packages may be browsed before their start date so customers
      // can plan or inquire in advance. Hide them only after they expire.
      {
        validityType: 'SEASONAL',
        endDate: { gte: now },
      },
    ],
  };

  if (departureCity) where.departureCity = { contains: departureCity, mode: 'insensitive' };
  if (destination) where.destination = { contains: destination, mode: 'insensitive' };
  if (packageRegion) where.packageRegion = packageRegion;
  if (packageType) where.packageType = packageType;
  if (validityType) where.validityType = validityType;
  if (duration) where.duration = { contains: duration, mode: 'insensitive' };
  if (hotelCategory) where.hotelCategory = { contains: hotelCategory, mode: 'insensitive' };
  if (minPriceInPaise !== undefined || maxPriceInPaise !== undefined) {
    where.priceInPaise = {};
    if (minPriceInPaise !== undefined) where.priceInPaise.gte = minPriceInPaise;
    if (maxPriceInPaise !== undefined) where.priceInPaise.lte = maxPriceInPaise;
  }

  const [items, total] = await Promise.all([
    prisma.package.findMany({
      where,
      orderBy: { [sortBy]: order },
      take,
      skip,
      select: PACKAGE_SELECT,
    }),
    prisma.package.count({ where }),
  ]);

  return { items, total };
};

// -----------------------------------------------------------------------------
//   State transitions — CAS-guarded so parallel edits don't race
// -----------------------------------------------------------------------------

/**
 * DRAFT/REJECTED → SUBMITTED. Guarded by current status so a package that's
 * already APPROVED can't be "submitted" again.
 *
 * Returns { updated, package, currentStatus, notFound }.
 */
export const submitPackage = async ({ id, vendorUserId }) => {
  const now = new Date();
  const result = await prisma.package.updateMany({
    where: {
      id,
      vendorUserId,
      deletedAt: null,
      status: { in: ['DRAFT', 'REJECTED'] },
    },
    data: {
      status: 'SUBMITTED',
      submittedAt: now,
      // Fresh submission clears prior review notes/decisions.
      reviewedAt: null,
      reviewedByAdminId: null,
      rejectionReason: null,
      hasPendingReview: false,
    },
  });

  if (result.count === 1) {
    const pkg = await prisma.package.findUnique({ where: { id }, select: PACKAGE_SELECT });
    return { updated: true, package: pkg };
  }

  const existing = await prisma.package.findFirst({
    where: { id, vendorUserId, deletedAt: null },
    select: { status: true },
  });
  if (!existing) return { updated: false, notFound: true };
  return { updated: false, currentStatus: existing.status };
};

/**
 * SUBMITTED → APPROVED. Also clears hasPendingReview so re-reviews collapse
 * back to a clean state.
 */
export const approvePackage = async ({ id, adminId }) => {
  const now = new Date();
  const result = await prisma.package.updateMany({
    where: {
      id,
      deletedAt: null,
      status: 'SUBMITTED',
    },
    data: {
      status: 'APPROVED',
      reviewedAt: now,
      reviewedByAdminId: adminId,
      rejectionReason: null,
      hasPendingReview: false,
    },
  });

  if (result.count === 1) {
    const pkg = await prisma.package.findUnique({ where: { id }, select: PACKAGE_SELECT });
    return { updated: true, package: pkg };
  }

  const existing = await prisma.package.findFirst({
    where: { id, deletedAt: null },
    select: { status: true },
  });
  if (!existing) return { updated: false, notFound: true };
  return { updated: false, currentStatus: existing.status };
};

/**
 * Reject a package with a reason. Two entry points:
 *
 *   • SUBMITTED → REJECTED  — pre-approval reject ("your submission was not
 *                              accepted, please fix and resubmit").
 *   • APPROVED  → REJECTED  — post-approval take-down ("this live package has
 *                              been removed from the marketplace for X reason").
 *
 * In both cases the vendor sees the same rejectionReason field and can edit
 * + resubmit if they want. The catch-all "REJECTED" status keeps the state
 * machine small; the reason field carries the semantic distinction.
 */
export const rejectPackage = async ({ id, adminId, reason }) => {
  const now = new Date();
  const result = await prisma.package.updateMany({
    where: {
      id,
      deletedAt: null,
      status: { in: ['SUBMITTED', 'APPROVED'] },
    },
    data: {
      status: 'REJECTED',
      reviewedAt: now,
      reviewedByAdminId: adminId,
      rejectionReason: reason,
      hasPendingReview: false,
    },
  });

  if (result.count === 1) {
    const pkg = await prisma.package.findUnique({ where: { id }, select: PACKAGE_SELECT });
    return { updated: true, package: pkg };
  }

  const existing = await prisma.package.findFirst({
    where: { id, deletedAt: null },
    select: { status: true },
  });
  if (!existing) return { updated: false, notFound: true };
  return { updated: false, currentStatus: existing.status };
};

/**
 * APPROVED → PAUSED (vendor self-pause). Only APPROVED can pause — DRAFT or
 * SUBMITTED shouldn't have "resume" semantics.
 */
export const pausePackage = async ({ id, vendorUserId }) => {
  const result = await prisma.package.updateMany({
    where: {
      id,
      vendorUserId,
      deletedAt: null,
      status: 'APPROVED',
    },
    data: { status: 'PAUSED' },
  });

  if (result.count === 1) {
    const pkg = await prisma.package.findUnique({ where: { id }, select: PACKAGE_SELECT });
    return { updated: true, package: pkg };
  }

  const existing = await prisma.package.findFirst({
    where: { id, vendorUserId, deletedAt: null },
    select: { status: true },
  });
  if (!existing) return { updated: false, notFound: true };
  return { updated: false, currentStatus: existing.status };
};

/**
 * PAUSED → APPROVED. No re-review required.
 */
export const resumePackage = async ({ id, vendorUserId }) => {
  const result = await prisma.package.updateMany({
    where: {
      id,
      vendorUserId,
      deletedAt: null,
      status: 'PAUSED',
    },
    data: { status: 'APPROVED' },
  });

  if (result.count === 1) {
    const pkg = await prisma.package.findUnique({ where: { id }, select: PACKAGE_SELECT });
    return { updated: true, package: pkg };
  }

  const existing = await prisma.package.findFirst({
    where: { id, vendorUserId, deletedAt: null },
    select: { status: true },
  });
  if (!existing) return { updated: false, notFound: true };
  return { updated: false, currentStatus: existing.status };
};

/**
 * Soft delete — sets deletedAt. Doesn't touch related Lead rows; the
 * `onDelete: SetNull` behaviour there kicks in only on hard delete, so we'll
 * revisit if we need "lead unlinks on package retirement" semantics later.
 */
export const softDeletePackage = async ({ id, vendorUserId }) => {
  const now = new Date();
  const result = await prisma.package.updateMany({
    where: { id, vendorUserId, deletedAt: null },
    data: { deletedAt: now },
  });

  if (result.count === 1) {
    const pkg = await prisma.package.findUnique({
      where: { id },
      select: PACKAGE_SELECT,
    });
    return { updated: true, package: pkg };
  }

  const existing = await prisma.package.findFirst({
    where: { id, vendorUserId },
    select: { id: true, deletedAt: true },
  });
  if (!existing) return { updated: false, notFound: true };
  return { updated: false, alreadyDeleted: true };
};
