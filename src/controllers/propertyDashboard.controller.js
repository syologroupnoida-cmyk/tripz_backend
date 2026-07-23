import * as dashboardService from '../services/propertyDashboard/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getInventorySummary = asyncHandler(async (req, res) => {
  const data = await dashboardService.getInventorySummary({
    ownerUserId: req.user.id,
    propertyId: req.params.id,
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Inventory summary retrieved.', data });
});

export const getPropertyCalendar = asyncHandler(async (req, res) => {
  const data = await dashboardService.getPropertyCalendar({
    ownerUserId: req.user.id,
    propertyId: req.params.id,
    month: req.query.month,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Calendar retrieved.', data });
});

export const getOwnerOverview = asyncHandler(async (req, res) => {
  const data = await dashboardService.getOwnerOverview({
    ownerUserId: req.user.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Overview retrieved.', data });
});
