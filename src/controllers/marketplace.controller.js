import * as marketplaceService from '../services/marketplace/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const browseLeads = asyncHandler(async (req, res) => {
  const data = await marketplaceService.browseLeads({
    vendorUserId: req.user.id,
    query: req.query,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Marketplace leads retrieved.',
    data,
  });
});

export const unlockLead = asyncHandler(async (req, res) => {
  const data = await marketplaceService.unlockLead({
    leadId: req.params.id,
    vendorUserId: req.user.id,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Lead unlocked. Contact details are now visible.',
    data,
  });
});
