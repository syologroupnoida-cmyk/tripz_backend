import { ApiError } from '../../utils/ApiError.js';
import * as storyRepo from '../../repositories/story.repository.js';

const slugify = (raw) =>
  String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const generateUniqueSlug = async (baseText) => {
  const base = slugify(baseText) || 'story';
  let candidate = base;
  let n = 1;
  while (true) {
    const existing = await storyRepo.getStoryBySlug(candidate);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
    if (n > 50) return `${base}-${Date.now()}`;
  }
};

// ---- Authenticated CRUD (own stories) ----
export const createStory = async ({ authorUserId, data }) => {
  const slug = await generateUniqueSlug(data.title);
  const story = await storyRepo.createStory({
    authorUserId,
    slug,
    ...data,
  });
  return { story, message: 'Story published.' };
};

export const updateStory = async ({ authorUserId, storyId, data }) => {
  const existing = await storyRepo.getStoryById(storyId);
  if (!existing) throw ApiError.notFound('Story not found.');
  if (existing.authorUserId !== authorUserId) {
    throw new ApiError(403, 'You can only edit your own stories.');
  }

  const patch = { ...data };
  if (data.title && data.title !== existing.title) {
    patch.slug = await generateUniqueSlug(data.title);
  }

  const updated = await storyRepo.updateStory(storyId, patch);
  return { story: updated, message: 'Story updated.' };
};

export const deleteOwnStory = async ({ authorUserId, storyId }) => {
  const existing = await storyRepo.getStoryById(storyId);
  if (!existing) throw ApiError.notFound('Story not found.');
  if (existing.authorUserId !== authorUserId) {
    throw new ApiError(403, 'You can only delete your own stories.');
  }
  const ok = await storyRepo.softDeleteOwnStory({ id: storyId, authorUserId });
  if (!ok) throw new ApiError(500, 'Failed to delete story.');
  return { message: 'Story deleted.' };
};

export const listMyStories = async (query) => {
  const { items, total } = await storyRepo.listMyStories(query);
  return { items, total, take: query.take, skip: query.skip };
};

export const getMyStoryDetail = async ({ authorUserId, storyId }) => {
  const story = await storyRepo.getStoryById(storyId);
  if (!story) throw ApiError.notFound('Story not found.');
  if (story.authorUserId !== authorUserId) {
    throw new ApiError(403, 'You can only view your own stories.');
  }
  return story;
};

// ---- Public ----
export const listStoriesPublic = async (query) => {
  const { items, total } = await storyRepo.listStoriesPublic(query);
  return { items, total, take: query.take, skip: query.skip };
};

export const getStoryBySlugPublic = async (slug) => {
  const story = await storyRepo.getStoryBySlugPublic(slug);
  if (!story) throw ApiError.notFound('Story not found.');
  return story;
};

// ---- Admin moderation ----
export const listStoriesForAdmin = async (query) => {
  const { items, total } = await storyRepo.listStoriesForAdmin(query);
  return { items, total, take: query.take, skip: query.skip };
};

export const adminDeleteStory = async ({ storyId }) => {
  const existing = await storyRepo.getStoryById(storyId);
  if (!existing) throw ApiError.notFound('Story not found.');
  const ok = await storyRepo.adminSoftDeleteStory({ id: storyId });
  if (!ok) throw new ApiError(500, 'Failed to delete story.');
  return { message: 'Story deleted by admin.' };
};

// Merged hide + unhide — hidden flag drives direction.
// hidden=true  → PUBLISHED → HIDDEN (accepts optional reason)
// hidden=false → HIDDEN → PUBLISHED (clears hiddenReason)
export const adminSetStoryVisibility = async ({ storyId, hidden, reason }) => {
  const existing = await storyRepo.getStoryById(storyId);
  if (!existing) throw ApiError.notFound('Story not found.');

  const targetStatus = hidden ? 'HIDDEN' : 'PUBLISHED';
  if (existing.status === targetStatus) {
    throw new ApiError(409, `Story is already ${hidden ? 'hidden' : 'published'}.`);
  }

  const updated = await storyRepo.setStoryStatus({
    id: storyId,
    status: targetStatus,
    hiddenReason: hidden ? reason : null,
  });
  return {
    story: updated,
    message: hidden ? 'Story hidden.' : 'Story unhidden.',
  };
};
