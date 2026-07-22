import { ApiError } from '../../utils/ApiError.js';
import * as propertyRepo from '../../repositories/property.repository.js';

// ---- Slug generation (same pattern as Package/TravelGuide) ----
const slugify = (raw) =>
  String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const generateUniqueSlug = async (baseText) => {
  const base = slugify(baseText) || 'property';
  let candidate = base;
  let n = 1;
  while (true) {
    const existing = await propertyRepo.getPropertyBySlug(candidate);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
    if (n > 50) return `${base}-${Date.now()}`;
  }
};

// Completeness check when transitioning DRAFT/REJECTED → SUBMITTED.
// Returns list of missing required fields (empty = ready to submit).
const getMissingFieldsForSubmit = (property) => {
  const missing = [];
  if (!property.title || property.title.trim().length < 2) missing.push('title');
  if (!property.propertyType) missing.push('propertyType');
  if (!property.shortDescription || property.shortDescription.length < 20) {
    missing.push('shortDescription (min 20 chars)');
  }
  if (!property.fullDescription || property.fullDescription.length < 50) {
    missing.push('fullDescription (min 50 chars)');
  }
  if (!property.city) missing.push('city');
  if (!property.state) missing.push('state');
  if (!property.address) missing.push('address');
  if (!property.mainImage) missing.push('mainImage');
  if (!property.galleryImages || property.galleryImages.length < 2) {
    missing.push('at least 2 galleryImages');
  }
  if (!property.rooms || property.rooms.length === 0) {
    missing.push('at least 1 room');
  }
  return missing;
};

// ---- Vendor CRUD ----

// Create property. `draft=false` submits immediately for admin review.
export const createProperty = async ({ ownerUserId, data, draft = true }) => {
  const slug = await generateUniqueSlug(data.title);
  const property = await propertyRepo.createProperty({
    ownerUserId,
    slug,
    ...data,
    status: 'DRAFT',
  });

  // If draft=false, run completeness check + transition to SUBMITTED
  if (!draft) {
    const missing = getMissingFieldsForSubmit(property);
    if (missing.length > 0) {
      // Row saved as DRAFT — vendor can PATCH later
      throw new ApiError(400, 'Property is missing required fields to submit for review.', {
        code: 'PROPERTY_INCOMPLETE',
        missingFields: missing,
        propertyId: property.id,
      });
    }
    const submitted = await propertyRepo.updatePropertyStatus({
      id: property.id,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      rejectionReason: null,
    });
    return { property: submitted, message: 'Property submitted for admin review.' };
  }

  return { property, message: 'Property saved as draft.' };
};

// Update property fields. Rooms managed via /rooms endpoints.
export const updateProperty = async ({ ownerUserId, propertyId, data, draft = true }) => {
  const existing = await propertyRepo.getPropertyById(propertyId);
  if (!existing) throw ApiError.notFound('Property not found.');
  if (existing.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only edit your own properties.');
  }
  if (existing.status === 'SUBMITTED') {
    throw new ApiError(409, 'This property is under admin review. Wait for the decision before editing.', {
      code: 'PROPERTY_UNDER_REVIEW',
    });
  }

  // Title change → slug regen
  const patch = { ...data };
  if (data.title && data.title !== existing.title) {
    patch.slug = await generateUniqueSlug(data.title);
  }

  // APPROVED/PAUSED properties edited post-approval → flag for re-review
  if (existing.status === 'APPROVED' || existing.status === 'PAUSED') {
    patch.hasPendingReview = true;
  }

  const updated = await propertyRepo.updateProperty(propertyId, patch);

  // If draft=false, submit for review after update (DRAFT/REJECTED only)
  if (!draft && ['DRAFT', 'REJECTED'].includes(updated.status)) {
    const missing = getMissingFieldsForSubmit(updated);
    if (missing.length > 0) {
      throw new ApiError(400, 'Property is missing required fields to submit for review.', {
        code: 'PROPERTY_INCOMPLETE',
        missingFields: missing,
      });
    }
    const submitted = await propertyRepo.updatePropertyStatus({
      id: propertyId,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      rejectionReason: null,
    });
    return { property: submitted, message: 'Property submitted for admin review.' };
  }

  return { property: updated, message: 'Property updated.' };
};

// Soft delete (owner only)
export const deleteProperty = async ({ ownerUserId, propertyId }) => {
  const existing = await propertyRepo.getPropertyById(propertyId);
  if (!existing) throw ApiError.notFound('Property not found.');
  if (existing.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only delete your own properties.');
  }
  const ok = await propertyRepo.softDeleteProperty({ id: propertyId, ownerUserId });
  if (!ok) throw new ApiError(500, 'Failed to delete property.');
  return { message: 'Property deleted.' };
};

// Pause/resume (APPROVED ↔ PAUSED)
export const setPropertyPaused = async ({ ownerUserId, propertyId, paused }) => {
  const existing = await propertyRepo.getPropertyById(propertyId);
  if (!existing) throw ApiError.notFound('Property not found.');
  if (existing.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only pause your own properties.');
  }

  const fromStatus = paused ? 'APPROVED' : 'PAUSED';
  const toStatus = paused ? 'PAUSED' : 'APPROVED';
  if (existing.status !== fromStatus) {
    throw new ApiError(409, `Only ${fromStatus} properties can be ${paused ? 'paused' : 'resumed'}.`, {
      code: 'INVALID_TRANSITION',
      currentStatus: existing.status,
    });
  }

  const updated = await propertyRepo.updatePropertyStatus({ id: propertyId, status: toStatus });
  return {
    property: updated,
    message: paused ? 'Property paused.' : 'Property resumed.',
  };
};

// List my properties
export const listMyProperties = async (query) => {
  const { items, total } = await propertyRepo.listPropertiesForOwner(query);
  return { items, total, take: query.take, skip: query.skip };
};

// Get my property detail
export const getMyPropertyDetail = async ({ ownerUserId, propertyId }) => {
  const property = await propertyRepo.getPropertyById(propertyId);
  if (!property) throw ApiError.notFound('Property not found.');
  if (property.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only view your own properties.');
  }
  return property;
};

// ---- Public marketplace ----

// Browse APPROVED properties with filters.
export const listPropertiesPublic = async (query) => {
  const { items, total } = await propertyRepo.listPropertiesPublic(query);
  return { items, total, take: query.take, skip: query.skip };
};

// Public detail by slug — with optional per-room availability if dates given.
export const getPropertyBySlugPublic = async ({ slug, checkIn, checkOut, guests, nights }) => {
  const property = await propertyRepo.getPropertyBySlugForMarketplace(slug);
  if (!property) throw ApiError.notFound('Property not found.');

  // If no dates provided, return base property with rooms (no availability info)
  if (!checkIn || !checkOut) return property;

  // Attach real-time availability per room
  const roomsWithAvailability = await Promise.all(
    property.rooms.map(async (room) => {
      const bookedUnits = await propertyRepo.countBookedUnitsForRoom({
        roomId: room.id,
        checkIn,
        checkOut,
      });
      const availableUnits = Math.max(0, room.totalUnits - bookedUnits);
      const guestsOk = !guests || room.maxGuests >= guests;
      return {
        ...room,
        availableUnits,
        isAvailable: availableUnits > 0 && guestsOk,
        totalPriceInPaise: room.pricePerNightInPaise * nights,
      };
    }),
  );

  return {
    ...property,
    rooms: roomsWithAvailability,
    stayContext: { checkIn, checkOut, nights, guests: guests ?? null },
  };
};

// Availability check endpoint — used by frontend before showing booking form.
// Returns availability + total price per room for the requested date window.
export const checkPropertyAvailability = async ({ slug, checkIn, checkOut, guests, nights }) => {
  const property = await propertyRepo.getPropertyBySlugForMarketplace(slug);
  if (!property) throw ApiError.notFound('Property not found.');

  const rooms = await Promise.all(
    property.rooms.map(async (room) => {
      const bookedUnits = await propertyRepo.countBookedUnitsForRoom({
        roomId: room.id,
        checkIn,
        checkOut,
      });
      const availableUnits = Math.max(0, room.totalUnits - bookedUnits);
      const guestsOk = !guests || room.maxGuests >= guests;
      return {
        id: room.id,
        name: room.name,
        category: room.category,
        pricePerNightInPaise: room.pricePerNightInPaise,
        maxGuests: room.maxGuests,
        totalUnits: room.totalUnits,
        bookedUnits,
        availableUnits,
        isAvailable: availableUnits > 0 && guestsOk,
        totalPriceInPaise: room.pricePerNightInPaise * nights,
      };
    }),
  );

  return {
    propertyId: property.id,
    slug: property.slug,
    checkIn,
    checkOut,
    nights,
    guests: guests ?? null,
    rooms,
    hasAvailability: rooms.some((r) => r.isAvailable),
  };
};

// ---- Admin moderation ----

// List properties for admin queue (with owner info).
export const listPropertiesForAdmin = async (query) => {
  const { items, total } = await propertyRepo.listPropertiesForAdmin(query);
  return { items, total, take: query.take, skip: query.skip };
};

// Get full property detail for admin (includes owner + KYC info).
export const getPropertyDetailForAdmin = async ({ propertyId }) => {
  const property = await propertyRepo.getPropertyByIdForAdmin(propertyId);
  if (!property) throw ApiError.notFound('Property not found.');
  return property;
};

// Approve property — SUBMITTED → APPROVED.
// Also clears hasPendingReview flag (post-approval edits gets re-approved here).
export const approveProperty = async ({ propertyId, adminId }) => {
  const existing = await propertyRepo.getPropertyById(propertyId);
  if (!existing) throw ApiError.notFound('Property not found.');
  if (existing.status !== 'SUBMITTED') {
    throw new ApiError(409, `Only SUBMITTED properties can be approved. Current status: ${existing.status}.`, {
      code: 'INVALID_TRANSITION',
      currentStatus: existing.status,
    });
  }

  const updated = await propertyRepo.updatePropertyStatus({
    id: propertyId,
    status: 'APPROVED',
    approvedAt: new Date(),
    rejectedAt: null,
    rejectionReason: null,
    reviewedByAdminId: adminId,
    hasPendingReview: false,
  });
  return { property: updated, message: 'Property approved. Now live on marketplace.' };
};

// Reject property — works on SUBMITTED (pre-approval) OR APPROVED (take-down).
// Vendor sees rejectionReason, can fix + resubmit via PATCH ?draft=false.
export const rejectProperty = async ({ propertyId, adminId, reason }) => {
  const existing = await propertyRepo.getPropertyById(propertyId);
  if (!existing) throw ApiError.notFound('Property not found.');

  // Allow reject on SUBMITTED (normal flow) or APPROVED (post-approval takedown)
  if (!['SUBMITTED', 'APPROVED', 'PAUSED'].includes(existing.status)) {
    throw new ApiError(409, `Property cannot be rejected from ${existing.status}.`, {
      code: 'INVALID_TRANSITION',
      currentStatus: existing.status,
    });
  }

  const updated = await propertyRepo.updatePropertyStatus({
    id: propertyId,
    status: 'REJECTED',
    rejectedAt: new Date(),
    rejectionReason: reason,
    reviewedByAdminId: adminId,
    hasPendingReview: false,
  });
  return {
    property: updated,
    message: existing.status === 'SUBMITTED'
      ? 'Property rejected. Vendor can fix and resubmit.'
      : 'Property taken down from marketplace.',
  };
};

// ---- Room CRUD (owner only, ownership check via property) ----

export const addRoomToProperty = async ({ ownerUserId, propertyId, data }) => {
  const property = await propertyRepo.getPropertyById(propertyId);
  if (!property) throw ApiError.notFound('Property not found.');
  if (property.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only add rooms to your own properties.');
  }

  const room = await propertyRepo.createRoomForProperty({ propertyId, data });

  // Adding room to APPROVED/PAUSED property → flag re-review
  if (['APPROVED', 'PAUSED'].includes(property.status)) {
    await propertyRepo.updateProperty(propertyId, { hasPendingReview: true });
  }

  return { room, message: 'Room added.' };
};

export const updatePropertyRoom = async ({ ownerUserId, roomId, data }) => {
  const room = await propertyRepo.getRoomById(roomId);
  if (!room || room.property.deletedAt) throw ApiError.notFound('Room not found.');
  if (room.property.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only edit rooms in your own properties.');
  }

  const updated = await propertyRepo.updateRoom(roomId, data);
  return { room: updated, message: 'Room updated.' };
};

export const deletePropertyRoom = async ({ ownerUserId, roomId }) => {
  const room = await propertyRepo.getRoomById(roomId);
  if (!room || room.property.deletedAt) throw ApiError.notFound('Room not found.');
  if (room.property.ownerUserId !== ownerUserId) {
    throw new ApiError(403, 'You can only delete rooms in your own properties.');
  }

  await propertyRepo.deleteRoom(roomId);
  return { message: 'Room deleted.' };
};
