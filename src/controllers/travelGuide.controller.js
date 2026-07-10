import * as guideService from '../services/travelGuide/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ---- Vendor ----
export const createTravelGuide = asyncHandler(async (req, res) => {
  const data = await guideService.createTravelGuide({
    vendorUserId: req.user.id,
    data: req.body,
  });
  return sendSuccess(res, { statusCode: 201, message: data.message, data: data.guide });
});

export const updateTravelGuide = asyncHandler(async (req, res) => {
  const data = await guideService.updateTravelGuide({
    vendorUserId: req.user.id,
    guideId: req.params.id,
    data: req.body,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.guide });
});

export const deleteTravelGuide = asyncHandler(async (req, res) => {
  const data = await guideService.deleteTravelGuide({
    vendorUserId: req.user.id,
    guideId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: null });
});

export const listMyTravelGuides = asyncHandler(async (req, res) => {
  const data = await guideService.listMyTravelGuides({
    ...req.query,
    vendorUserId: req.user.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Guides retrieved.', data });
});

export const getMyGuideDetail = asyncHandler(async (req, res) => {
  const data = await guideService.getMyGuideDetail({
    vendorUserId: req.user.id,
    guideId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Guide retrieved.', data });
});

// ---- Public ----
export const listGuidesPublic = asyncHandler(async (req, res) => {
  const data = await guideService.listGuidesPublic(req.query);
  return sendSuccess(res, { statusCode: 200, message: 'Guides retrieved.', data });
});

export const getGuideBySlugPublic = asyncHandler(async (req, res) => {
  const data = await guideService.getGuideBySlugPublic(req.params.slug);
  return sendSuccess(res, { statusCode: 200, message: 'Guide retrieved.', data });
});
