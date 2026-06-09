import * as kycService from '../services/vendorKyc/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// --- Vendor-scoped handlers (operates on req.user.id) ---

export const getMyKycStatus = asyncHandler(async (req, res) => {
  const data = await kycService.getMyKycStatus(req.user.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'KYC status retrieved.',
    data,
  });
});

export const submitMyKyc = asyncHandler(async (req, res) => {
  const data = await kycService.submitMyKyc({
    vendorUserId: req.user.id,
    payload: req.body,
  });
  return sendSuccess(res, {
    statusCode: 201,
    message: 'KYC submitted. Awaiting admin review.',
    data,
  });
});

// --- Vendor-scoped per-document verification ---

export const verifyPan = asyncHandler(async (req, res) => {
  const data = await kycService.verifyPan({
    vendorUserId: req.user.id,
    number: req.body.number,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'PAN verified successfully.',
    data,
  });
});

export const verifyGstin = asyncHandler(async (req, res) => {
  const data = await kycService.verifyGstin({
    vendorUserId: req.user.id,
    number: req.body.number,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'GSTIN verified successfully.',
    data,
  });
});

export const verifyCin = asyncHandler(async (req, res) => {
  const data = await kycService.verifyCin({
    vendorUserId: req.user.id,
    number: req.body.number,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'CIN verified successfully.',
    data,
  });
});

export const sendAadhaarOtp = asyncHandler(async (req, res) => {
  const data = await kycService.sendAadhaarOtp({
    vendorUserId: req.user.id,
    number: req.body.number,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Aadhaar OTP sent. Enter it to complete verification.',
    data,
  });
});

export const confirmAadhaarOtp = asyncHandler(async (req, res) => {
  const data = await kycService.confirmAadhaarOtp({
    vendorUserId: req.user.id,
    sessionId: req.body.sessionId,
    otp: req.body.otp,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Aadhaar verified successfully.',
    data,
  });
});

// --- Admin-scoped handlers ---

export const listKycForAdmin = asyncHandler(async (req, res) => {
  const data = await kycService.listKycForAdmin(req.query);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'KYC submissions retrieved.',
    data,
  });
});

export const approveVendorKyc = asyncHandler(async (req, res) => {
  const data = await kycService.approveVendorKyc({
    vendorUserId: req.params.userId,
    adminId: req.user.id,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'KYC approved successfully.',
    data,
  });
});

export const rejectVendorKyc = asyncHandler(async (req, res) => {
  const data = await kycService.rejectVendorKyc({
    vendorUserId: req.params.userId,
    adminId: req.user.id,
    reason: req.body.reason,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'KYC rejected.',
    data,
  });
});
