import * as vendorMgmt from '../services/vendorManagement/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// -----------------------------------------------------------------------------
//   READ — accessible to ADMIN + SUPER_ADMIN
// -----------------------------------------------------------------------------

export const listVendors = asyncHandler(async (req, res) => {
  const data = await vendorMgmt.listVendors(req.query);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Vendors retrieved.',
    data,
  });
});

export const getVendorDetail = asyncHandler(async (req, res) => {
  const data = await vendorMgmt.getVendorDetail(req.params.userId);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Vendor detail retrieved.',
    data,
  });
});

// -----------------------------------------------------------------------------
//   WRITE — SUPER_ADMIN only (role gate at routes/super-admin/index.js)
// -----------------------------------------------------------------------------

export const activateVendor = asyncHandler(async (req, res) => {
  const data = await vendorMgmt.activateVendor({
    vendorUserId: req.params.userId,
    adminId: req.user.id,
    reason: req.body.reason,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Vendor account activated.',
    data,
  });
});

export const deactivateVendor = asyncHandler(async (req, res) => {
  const data = await vendorMgmt.deactivateVendor({
    vendorUserId: req.params.userId,
    adminId: req.user.id,
    reason: req.body.reason,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Vendor account deactivated.',
    data,
  });
});

export const grantCredits = asyncHandler(async (req, res) => {
  const data = await vendorMgmt.grantCredits({
    vendorUserId: req.params.userId,
    amount: req.body.amount,
    notes: req.body.notes,
    adminId: req.user.id,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: `Granted ${req.body.amount} credits to vendor.`,
    data,
  });
});

export const revokeCredits = asyncHandler(async (req, res) => {
  const data = await vendorMgmt.revokeCredits({
    vendorUserId: req.params.userId,
    amount: req.body.amount,
    notes: req.body.notes,
    adminId: req.user.id,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: `Revoked ${req.body.amount} credits from vendor.`,
    data,
  });
});
