import * as vendorLeadsService from '../services/vendorLeads/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listMyUnlockedLeads = asyncHandler(async (req, res) => {
  const data = await vendorLeadsService.listMyUnlockedLeads({
    vendorUserId: req.user.id,
    ...req.query,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Your unlocked leads.',
    data,
  });
});

export const getMyUnlockedLead = asyncHandler(async (req, res) => {
  const data = await vendorLeadsService.getMyUnlockedLead({
    vendorUserId: req.user.id,
    assignmentId: req.params.assignmentId,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Lead retrieved.',
    data,
  });
});

export const listMyDirectLeads = asyncHandler(async (req, res) => {
  const data = await vendorLeadsService.listMyDirectLeads({
    vendorUserId: req.user.id,
    ...req.query,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Direct leads from your packages.',
    data,
  });
});
