import * as clientLeadsService from '../services/clientLeads/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listMyLeads = asyncHandler(async (req, res) => {
  const data = await clientLeadsService.listMyLeads({
    customerUserId: req.user.id,
    query: req.query,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Your inquiries.',
    data,
  });
});
