import * as businessProfileService from '../services/businessProfile/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const importCsv = asyncHandler(async (req, res) => {
  const isActiveRaw = req.body?.isActive ?? req.query?.isActive;
  const data = await businessProfileService.importBusinessProfilesCsv({
    file: req.file,
    mode: req.body?.mode ?? req.query?.mode ?? 'validate',
    isActive: isActiveRaw === undefined ? true : String(isActiveRaw) === 'true',
    adminId: req.user.id,
  });
  return sendSuccess(res, {
    statusCode: data.mode === 'import' ? 201 : 200,
    message: data.mode === 'import' ? 'Business profile import completed.' : 'Business profile CSV validated.',
    data,
  });
});

export const listAdmin = asyncHandler(async (req, res) => {
  const data = await businessProfileService.listBusinessProfiles(req.query);
  return sendSuccess(res, { message: 'Business profiles retrieved.', data });
});

export const getAdmin = asyncHandler(async (req, res) => {
  const data = await businessProfileService.getBusinessProfile(req.params.id);
  return sendSuccess(res, { message: 'Business profile retrieved.', data });
});

export const update = asyncHandler(async (req, res) => {
  const data = await businessProfileService.updateBusinessProfile(req.params.id, req.body);
  return sendSuccess(res, { message: 'Business profile updated.', data });
});

export const remove = asyncHandler(async (req, res) => {
  const data = await businessProfileService.deleteBusinessProfile(req.params.id);
  return sendSuccess(res, { message: 'Business profile deleted.', data });
});

export const listPublic = asyncHandler(async (req, res) => {
  const data = await businessProfileService.listBusinessProfiles(req.query, { publicOnly: true });
  return sendSuccess(res, { message: 'Active business profiles retrieved.', data });
});

export const getPublic = asyncHandler(async (req, res) => {
  const data = await businessProfileService.getBusinessProfile(req.params.id, { publicOnly: true });
  return sendSuccess(res, { message: 'Business profile retrieved.', data });
});
