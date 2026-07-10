import { ApiError } from '../../utils/ApiError.js';
import * as guideRepo from '../../repositories/travelGuide.repository.js';

// Slug generator — Package service se pattern
const slugify = (raw) =>
  String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const generateUniqueSlug = async (baseText) => {
  const base = slugify(baseText) || 'guide';
  let candidate = base;
  let n = 1;
  while (true) {
    const existing = await guideRepo.getGuideBySlug(candidate);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
    if (n > 50) return `${base}-${Date.now()}`;
  }
};

// ---- Vendor CRUD ----
export const createTravelGuide = async ({ vendorUserId, data }) => {
  const slug = await generateUniqueSlug(data.title);
  const guide = await guideRepo.createTravelGuide({
    vendorUserId,
    slug,
    ...data,
  });
  return { guide, message: 'Travel guide published.' };
};

export const updateTravelGuide = async ({ vendorUserId, guideId, data }) => {
  const existing = await guideRepo.getGuideById(guideId);
  if (!existing) throw ApiError.notFound('Travel guide not found.');
  if (existing.vendorUserId !== vendorUserId) {
    throw new ApiError(403, 'You can only edit your own travel guides.');
  }

  // Title change → slug regen
  const patch = { ...data };
  if (data.title && data.title !== existing.title) {
    patch.slug = await generateUniqueSlug(data.title);
  }

  const updated = await guideRepo.updateGuide(guideId, patch);
  return { guide: updated, message: 'Travel guide updated.' };
};

export const deleteTravelGuide = async ({ vendorUserId, guideId }) => {
  const existing = await guideRepo.getGuideById(guideId);
  if (!existing) throw ApiError.notFound('Travel guide not found.');
  if (existing.vendorUserId !== vendorUserId) {
    throw new ApiError(403, 'You can only delete your own travel guides.');
  }
  const ok = await guideRepo.softDeleteGuide({ id: guideId, vendorUserId });
  if (!ok) throw new ApiError(500, 'Failed to delete travel guide.');
  return { message: 'Travel guide deleted.' };
};

export const listMyTravelGuides = async (query) => {
  const { items, total } = await guideRepo.listGuidesForVendor(query);
  return { items, total, take: query.take, skip: query.skip };
};

export const getMyGuideDetail = async ({ vendorUserId, guideId }) => {
  const guide = await guideRepo.getGuideById(guideId);
  if (!guide) throw ApiError.notFound('Travel guide not found.');
  if (guide.vendorUserId !== vendorUserId) {
    throw new ApiError(403, 'You can only view your own travel guides.');
  }
  return guide;
};

// ---- Public read ----
export const listGuidesPublic = async (query) => {
  const { items, total } = await guideRepo.listGuidesPublic(query);
  return { items, total, take: query.take, skip: query.skip };
};

export const getGuideBySlugPublic = async (slug) => {
  const guide = await guideRepo.getGuideBySlugPublic(slug);
  if (!guide) throw ApiError.notFound('Travel guide not found.');
  return guide;
};
