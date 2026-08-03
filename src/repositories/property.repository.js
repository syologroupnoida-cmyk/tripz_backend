import prisma from '../config/db.js';

// Fields returned to owner + admin. Public marketplace uses PUBLIC_PROPERTY_SELECT below.
const PROPERTY_SELECT = {
  id: true,
  ownerUserId: true,
  slug: true,
  title: true,
  propertyType: true,
  shortDescription: true,
  fullDescription: true,
  city: true,
  state: true,
  country: true,
  address: true,
  landmark: true,
  pincode: true,
  latitude: true,
  longitude: true,
  mainImage: true,
  galleryImages: true,
  amenities: true,
  houseRules: true,
  nearbyPlaces: true,
  highlights: true,
  starRating: true,
  totalBedrooms: true,
  totalBathrooms: true,
  hostLivesOnsite: true,
  checkInTime: true,
  checkOutTime: true,
  minStayNights: true,
  contactPhone: true,
  contactEmail: true,
  cancellationPolicy: true,
  status: true,
  hasPendingReview: true,
  submittedAt: true,
  approvedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
  rooms: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      pricePerNightInPaise: true,
      extraGuestFeeInPaise: true,
      maxGuests: true,
      totalUnits: true,
      bedrooms: true,
      bathrooms: true,
      bedType: true,
      roomSizeSqft: true,
      amenities: true,
      images: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  },
};

// Public marketplace hides contact + rejection fields; only APPROVED properties
const PUBLIC_PROPERTY_SELECT = {
  id: true,
  slug: true,
  title: true,
  propertyType: true,
  shortDescription: true,
  fullDescription: true,
  city: true,
  state: true,
  country: true,
  landmark: true,
  latitude: true,
  longitude: true,
  mainImage: true,
  galleryImages: true,
  amenities: true,
  houseRules: true,
  nearbyPlaces: true,
  highlights: true,
  starRating: true,
  totalBedrooms: true,
  totalBathrooms: true,
  hostLivesOnsite: true,
  checkInTime: true,
  checkOutTime: true,
  minStayNights: true,
  cancellationPolicy: true,
  createdAt: true,
  rooms: {
    where: { isActive: true },
    orderBy: { pricePerNightInPaise: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      pricePerNightInPaise: true,
      extraGuestFeeInPaise: true,
      maxGuests: true,
      totalUnits: true,
      bedrooms: true,
      bathrooms: true,
      bedType: true,
      roomSizeSqft: true,
      amenities: true,
      images: true,
    },
  },
};

// ---- Slug lookup (used by service for uniqueness check) ----
export const getPropertyBySlug = async (slug) => {
  return prisma.property.findUnique({
    where: { slug },
    select: { id: true, slug: true, deletedAt: true },
  });
};

// ---- Create property (with optional embedded rooms) ----
export const createProperty = async ({ rooms, ...data }) => {
  return prisma.property.create({
    data: {
      ...data,
      rooms: rooms && rooms.length > 0 ? { create: rooms } : undefined,
    },
    select: PROPERTY_SELECT,
  });
};

// ---- Fetch by id (owner + admin view) ----
export const getPropertyById = async (id) => {
  return prisma.property.findFirst({
    where: { id, deletedAt: null },
    select: PROPERTY_SELECT,
  });
};

// ---- Public detail by slug ----
export const getPropertyBySlugPublic = async (slug) => {
  return prisma.property.findFirst({
    where: { slug, deletedAt: null, status: 'APPROVED' },
    select: PUBLIC_PROPERTY_SELECT,
  });
};

// ---- Update property fields (rooms managed separately) ----
export const updateProperty = async (id, data) => {
  return prisma.property.update({
    where: { id },
    data,
    select: PROPERTY_SELECT,
  });
};

// ---- Update status only (used by submit/approve/reject/pause flows) ----
export const updatePropertyStatus = async ({ id, status, ...extra }) => {
  return prisma.property.update({
    where: { id },
    data: { status, ...extra },
    select: PROPERTY_SELECT,
  });
};

// ---- CAS transition (ownership + current status guard) ----
export const transitionPropertyStatus = async ({
  id,
  ownerUserId,
  fromStatuses,
  toStatus,
  extra = {},
}) => {
  const where = {
    id,
    deletedAt: null,
    status: { in: fromStatuses },
  };
  if (ownerUserId) where.ownerUserId = ownerUserId;

  const result = await prisma.property.updateMany({
    where,
    data: { status: toStatus, ...extra },
  });
  return result.count === 1;
};

// ---- Soft delete (owner only) ----
export const softDeleteProperty = async ({ id, ownerUserId }) => {
  const result = await prisma.property.updateMany({
    where: { id, ownerUserId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count === 1;
};

// ---- Vendor's own properties list ----
export const listPropertiesForOwner = async ({
  ownerUserId, status, propertyType, sortBy, order, take, skip,
}) => {
  const where = { ownerUserId, deletedAt: null };
  if (status) where.status = status;
  if (propertyType) where.propertyType = propertyType;

  const [items, total] = await Promise.all([
    prisma.property.findMany({
      where,
      orderBy: { [sortBy]: order },
      take, skip,
      select: PROPERTY_SELECT,
    }),
    prisma.property.count({ where }),
  ]);
  return { items, total };
};

// ---- Admin: list all properties with filters + owner info ----
// Admin sees owner details, KYC status, etc. — richer view than owner's own list.
export const listPropertiesForAdmin = async ({
  status, propertyType, hasPendingReview, ownerUserId, city, search,
  sortBy, order, take, skip,
}) => {
  const where = { deletedAt: null };
  if (status) where.status = status;
  if (propertyType) where.propertyType = propertyType;
  if (hasPendingReview !== undefined) where.hasPendingReview = hasPendingReview;
  if (ownerUserId) where.ownerUserId = ownerUserId;
  if (city) where.city = { contains: city, mode: 'insensitive' };
  if (search) where.title = { contains: search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.property.findMany({
      where,
      orderBy: { [sortBy]: order },
      take, skip,
      select: {
        ...PROPERTY_SELECT,
        owner: {
          select: {
            userId: true,
            vendorType: true,
            kycStatus: true,
            user: {
              select: {
                id: true, firstName: true, lastName: true,
                email: true, phone: true, isActive: true,
              },
            },
          },
        },
      },
    }),
    prisma.property.count({ where }),
  ]);
  return { items, total };
};

// ---- Admin: full detail with owner + KYC info ----
export const getPropertyByIdForAdmin = async (id) => {
  return prisma.property.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...PROPERTY_SELECT,
      owner: {
        select: {
          userId: true,
          vendorType: true,
          kycStatus: true,
          user: {
            select: {
              id: true, firstName: true, lastName: true,
              email: true, phone: true, isActive: true, createdAt: true,
            },
          },
        },
      },
    },
  });
};

// ---- Public marketplace ----

// Browse APPROVED properties with filters. Optional date-range filter checks
// that at least one room has some availability for the window.
export const listPropertiesPublic = async ({
  city, state, country, propertyType,
  minPriceInPaise, maxPriceInPaise,
  guests, starRating, amenities,
  checkIn, checkOut,
  search, sortBy, order, take, skip,
}) => {
  const where = { deletedAt: null, status: 'APPROVED' };
  if (city) where.city = { contains: city, mode: 'insensitive' };
  if (state) where.state = { contains: state, mode: 'insensitive' };
  if (country) where.country = { contains: country, mode: 'insensitive' };
  if (propertyType) where.propertyType = propertyType;
  if (starRating) where.starRating = { gte: starRating };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { shortDescription: { contains: search, mode: 'insensitive' } },
    ];
  }
  // Amenities filter — property must have ALL specified amenities
  if (amenities && amenities.length > 0) {
    where.amenities = { hasEvery: amenities };
  }

  // Price + guests filter through nested room criteria — property qualifies if
  // ANY active room matches.
  const roomFilter = { isActive: true };
  if (minPriceInPaise !== undefined) roomFilter.pricePerNightInPaise = { gte: minPriceInPaise };
  if (maxPriceInPaise !== undefined) {
    roomFilter.pricePerNightInPaise = {
      ...(roomFilter.pricePerNightInPaise ?? {}),
      lte: maxPriceInPaise,
    };
  }
  if (guests) roomFilter.maxGuests = { gte: guests };

  if (Object.keys(roomFilter).length > 1) {
    where.rooms = { some: roomFilter };
  }

  // Sort key mapping
  const orderBy = sortBy === 'price'
    ? [{ rooms: { _count: 'desc' } }] // Approximate; per-property min-price sort is complex
    : { [sortBy]: order };

  const [items, total] = await Promise.all([
    prisma.property.findMany({
      where,
      orderBy,
      take, skip,
      select: PUBLIC_PROPERTY_SELECT,
    }),
    prisma.property.count({ where }),
  ]);

  // If date range given, filter out properties with zero available rooms
  if (checkIn && checkOut) {
    const filtered = [];
    for (const p of items) {
      const anyAvailable = await hasAnyRoomAvailable({
        propertyId: p.id,
        rooms: p.rooms,
        checkIn,
        checkOut,
      });
      if (anyAvailable) filtered.push(p);
    }
    return { items: filtered, total: filtered.length };
  }

  return { items, total };
};

// Public detail by slug (APPROVED only)
// Same as getPropertyBySlugPublic but re-exported here for symmetry.
export const getPropertyBySlugForMarketplace = async (slug) => {
  return prisma.property.findFirst({
    where: { slug, deletedAt: null, status: 'APPROVED' },
    select: PUBLIC_PROPERTY_SELECT,
  });
};

// Sum of overlapping booking-items for a specific room within a date window.
// Items live on PropertyBookingItem now (multi-room bookings) — we aggregate
// via the booking relation to check status + date overlap.
// Overlap rule: booking checkOut > requestCheckIn AND booking checkIn < requestCheckOut
export const countBookedUnitsForRoom = async ({ roomId, checkIn, checkOut }) => {
  const result = await prisma.propertyBookingItem.aggregate({
    where: {
      roomId,
      booking: {
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        checkOut: { gt: checkIn },
        checkIn:  { lt: checkOut },
      },
    },
    _sum: { unitsBooked: true },
  });
  return result._sum.unitsBooked ?? 0;
};

// Helper for browse: does this property have ANY room with at least 1 unit
// available for the given date window?
const hasAnyRoomAvailable = async ({ rooms, checkIn, checkOut }) => {
  for (const r of rooms) {
    const booked = await countBookedUnitsForRoom({ roomId: r.id, checkIn, checkOut });
    if (r.totalUnits - booked > 0) return true;
  }
  return false;
};

// ---- Room CRUD (managed under a property) ----
export const createRoomForProperty = async ({ propertyId, data }) => {
  return prisma.propertyRoom.create({
    data: { propertyId, ...data },
    select: {
      id: true, propertyId: true, name: true, description: true, category: true,
      pricePerNightInPaise: true, extraGuestFeeInPaise: true,
      maxGuests: true, totalUnits: true,
      bedrooms: true, bathrooms: true, bedType: true, roomSizeSqft: true,
      amenities: true, images: true, isActive: true,
      createdAt: true, updatedAt: true,
    },
  });
};

export const getRoomById = async (id) => {
  return prisma.propertyRoom.findUnique({
    where: { id },
    include: { property: { select: { id: true, ownerUserId: true, deletedAt: true } } },
  });
};

export const updateRoom = async (id, data) => {
  return prisma.propertyRoom.update({
    where: { id },
    data,
    select: {
      id: true, propertyId: true, name: true, description: true, category: true,
      pricePerNightInPaise: true, extraGuestFeeInPaise: true,
      maxGuests: true, totalUnits: true,
      bedrooms: true, bathrooms: true, bedType: true, roomSizeSqft: true,
      amenities: true, images: true, isActive: true,
      createdAt: true, updatedAt: true,
    },
  });
};

export const deleteRoom = async (id) => {
  await prisma.propertyRoom.delete({ where: { id } });
  return true;
};
