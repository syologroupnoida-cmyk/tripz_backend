import * as adminDashboardService from '../services/adminDashboard/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getDashboardStats = asyncHandler(async (req, res) => {
  const data = await adminDashboardService.getDashboardStats();

  return sendSuccess(res, {
    message: 'Dashboard statistics retrieved.',
    data,
  });
});
