import * as storyService from '../services/story/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ---- Authenticated (own stories) ----
export const createStory = asyncHandler(async (req, res) => {
  const data = await storyService.createStory({
    authorUserId: req.user.id,
    data: req.body,
  });
  return sendSuccess(res, { statusCode: 201, message: data.message, data: data.story });
});

export const updateStory = asyncHandler(async (req, res) => {
  const data = await storyService.updateStory({
    authorUserId: req.user.id,
    storyId: req.params.id,
    data: req.body,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.story });
});

export const deleteOwnStory = asyncHandler(async (req, res) => {
  const data = await storyService.deleteOwnStory({
    authorUserId: req.user.id,
    storyId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: null });
});

export const listMyStories = asyncHandler(async (req, res) => {
  console.log('this is my storys', req.user.id)
  const data = await storyService.listMyStories({
    ...req.query,
    authorUserId: req.user.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Stories retrieved.', data });
});

export const getMyStoryDetail = asyncHandler(async (req, res) => {
  const data = await storyService.getMyStoryDetail({
    authorUserId: req.user.id,
    storyId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Story retrieved.', data });
});

// ---- Public ----
export const listStoriesPublic = asyncHandler(async (req, res) => {
  const data = await storyService.listStoriesPublic(req.query);
  return sendSuccess(res, { statusCode: 200, message: 'Stories retrieved.', data });
});

export const getStoryBySlugPublic = asyncHandler(async (req, res) => {
  const data = await storyService.getStoryBySlugPublic(req.params.slug);
  return sendSuccess(res, { statusCode: 200, message: 'Story retrieved.', data });
});

// ---- Admin ----
export const listStoriesForAdmin = asyncHandler(async (req, res) => {
  const data = await storyService.listStoriesForAdmin(req.query);
  return sendSuccess(res, { statusCode: 200, message: 'Stories retrieved.', data });
});

export const adminDeleteStory = asyncHandler(async (req, res) => {
  const data = await storyService.adminDeleteStory({ storyId: req.params.id });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: null });
});

export const adminSetStoryVisibility = asyncHandler(async (req, res) => {
  const data = await storyService.adminSetStoryVisibility({
    storyId: req.params.id,
    hidden: req.query.hidden,
    reason: req.body?.reason,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.story });
});
