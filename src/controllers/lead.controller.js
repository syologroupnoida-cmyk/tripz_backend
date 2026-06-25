import * as leadService from '../services/lead/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const submitLead = asyncHandler(async (req, res) => {
  // `req.user` will be set only if the public route is hit with a valid
  // bearer token (we don't require auth, but we link the lead if present).
  const customerUserId = req.user?.id ?? null;
  console.log('this is userId', customerUserId)
  const data = await leadService.submitLead({
    payload: req.body,
    customerUserId,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Lead submitted successfully.',
    data,
  });
});
