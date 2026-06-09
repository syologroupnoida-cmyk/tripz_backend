import * as superAdminService from '../services/superAdmin/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const createAdmin = asyncHandler(async (req, res) => {
  const result = await superAdminService.createAdminAccount(req.body);
  return sendSuccess(res, {
    statusCode: 201,
    message: 'Admin account created successfully.',
    data: result,
  });
});
