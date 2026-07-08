import * as packageService from '../services/package/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// -----------------------------------------------------------------------------
//   VENDOR — CRUD + lifecycle actions
// -----------------------------------------------------------------------------

export const createPackage = asyncHandler(async (req, res) => {
  // `req.query.asDraft` is set by createPackageQuerySchema. If the query
  // validator wasn't applied for some reason, default to draft = safest.
  const asDraft = req.query.asDraft !== false;
  const data = await packageService.createDraftPackage({
    vendorUserId: req.user.id,
    data: req.body,
    asDraft,
  });
  return sendSuccess(res, {
    statusCode: 201,
    message: data.message,
    data: data.package,
  });
});

export const updatePackage = asyncHandler(async (req, res) => {
  // `?draft` mirrors the create handler: draft=true (default) → save only;
  // draft=false → save + completeness check + transition DRAFT/REJECTED →
  // SUBMITTED. Normalised by updatePackageQuerySchema.
  const asDraft = req.query.asDraft !== false;
  const data = await packageService.updatePackage({
    vendorUserId: req.user.id,
    packageId: req.params.id,
    data: req.body,
    asDraft,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: data.message,
    data: data.package,
  });
});

export const togglePausePackage = asyncHandler(async (req, res) => {
  // `req.query.paused` is normalised by togglePausePackageQuerySchema; if the
  // validator wasn't applied for some reason, default to `true` (pause) —
  // matches the "?paused=true is the default" contract.
  const paused = req.query.paused !== false;
  const data = await packageService.togglePausePackageAsVendor({
    vendorUserId: req.user.id,
    packageId: req.params.id,
    paused,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: data.message,
    data: data.package,
  });
});

export const deletePackage = asyncHandler(async (req, res) => {
  const data = await packageService.deletePackageAsVendor({
    vendorUserId: req.user.id,
    packageId: req.params.id,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: data.message,
    data: data.package,
  });
});

export const listMyPackages = asyncHandler(async (req, res) => {
  const data = await packageService.listMyPackages({
    ...req.query,
    vendorUserId: req.user.id,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Packages retrieved.',
    data,
  });
});

export const getMyPackageDetail = asyncHandler(async (req, res) => {
  const data = await packageService.getMyPackageDetail({
    vendorUserId: req.user.id,
    packageId: req.params.id,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Package retrieved.',
    data,
  });
});

// -----------------------------------------------------------------------------
//   ADMIN — queue + approve/reject
// -----------------------------------------------------------------------------

export const listPackagesForAdmin = asyncHandler(async (req, res) => {
  const data = await packageService.listPackagesForAdmin(req.query);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Packages retrieved.',
    data,
  });
});

export const getPackageDetailForAdmin = asyncHandler(async (req, res) => {
  const data = await packageService.getPackageDetailForAdmin(req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Package retrieved.',
    data,
  });
});

export const approvePackage = asyncHandler(async (req, res) => {
  const data = await packageService.approvePackageAsAdmin({
    packageId: req.params.id,
    adminId: req.user.id,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: data.message,
    data: data.package,
  });
});

export const rejectPackage = asyncHandler(async (req, res) => {
  const data = await packageService.rejectPackageAsAdmin({
    packageId: req.params.id,
    adminId: req.user.id,
    reason: req.body.reason,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: data.message,
    data: data.package,
  });
});

// -----------------------------------------------------------------------------
//   PUBLIC — marketplace browse
// -----------------------------------------------------------------------------

export const listPackagesPublic = asyncHandler(async (req, res) => {
  const data = await packageService.listPackagesPublic(req.query);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Packages retrieved.',
    data,
  });
});

export const getPackageBySlugPublic = asyncHandler(async (req, res) => {
  const data = await packageService.getPackageBySlugPublic(req.params.slug);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Package retrieved.',
    data,
  });
});
