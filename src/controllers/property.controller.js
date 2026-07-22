import * as propertyService from '../services/property/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ---- Vendor CRUD ----
export const createProperty = asyncHandler(async (req, res) => {
  const data = await propertyService.createProperty({
    ownerUserId: req.user.id,
    data: req.body,
    draft: req.query.draft, // parsed as boolean by validator
  });
  return sendSuccess(res, { statusCode: 201, message: data.message, data: data.property });
});

export const updateProperty = asyncHandler(async (req, res) => {
  const data = await propertyService.updateProperty({
    ownerUserId: req.user.id,
    propertyId: req.params.id,
    data: req.body,
    draft: req.query.draft,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.property });
});

export const deleteProperty = asyncHandler(async (req, res) => {
  const data = await propertyService.deleteProperty({
    ownerUserId: req.user.id,
    propertyId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: null });
});

export const setPropertyPaused = asyncHandler(async (req, res) => {
  const data = await propertyService.setPropertyPaused({
    ownerUserId: req.user.id,
    propertyId: req.params.id,
    paused: req.query.paused,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.property });
});

export const listMyProperties = asyncHandler(async (req, res) => {
  const data = await propertyService.listMyProperties({
    ...req.query,
    ownerUserId: req.user.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Properties retrieved.', data });
});

export const getMyPropertyDetail = asyncHandler(async (req, res) => {
  const data = await propertyService.getMyPropertyDetail({
    ownerUserId: req.user.id,
    propertyId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Property retrieved.', data });
});

// ---- Public marketplace ----
export const listPropertiesPublic = asyncHandler(async (req, res) => {
  const data = await propertyService.listPropertiesPublic(req.query);
  return sendSuccess(res, { statusCode: 200, message: 'Properties retrieved.', data });
});

export const getPropertyBySlugPublic = asyncHandler(async (req, res) => {
  const data = await propertyService.getPropertyBySlugPublic({
    slug: req.params.slug,
    // Optional query params for availability calc
    checkIn: req.query.checkIn,
    checkOut: req.query.checkOut,
    guests: req.query.guests,
    nights: req.query.nights,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Property retrieved.', data });
});

export const checkPropertyAvailability = asyncHandler(async (req, res) => {
  const data = await propertyService.checkPropertyAvailability({
    slug: req.params.slug,
    checkIn: req.query.checkIn,
    checkOut: req.query.checkOut,
    guests: req.query.guests,
    nights: req.query.nights,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Availability retrieved.', data });
});

// ---- Admin moderation ----
export const listPropertiesForAdmin = asyncHandler(async (req, res) => {
  const data = await propertyService.listPropertiesForAdmin(req.query);
  return sendSuccess(res, { statusCode: 200, message: 'Properties retrieved.', data });
});

export const getPropertyDetailForAdmin = asyncHandler(async (req, res) => {
  const data = await propertyService.getPropertyDetailForAdmin({
    propertyId: req.params.id,
  });
  return sendSuccess(res, { statusCode: 200, message: 'Property retrieved.', data });
});

export const approveProperty = asyncHandler(async (req, res) => {
  const data = await propertyService.approveProperty({
    propertyId: req.params.id,
    adminId: req.user.id,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.property });
});

export const rejectProperty = asyncHandler(async (req, res) => {
  const data = await propertyService.rejectProperty({
    propertyId: req.params.id,
    adminId: req.user.id,
    reason: req.body.reason,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.property });
});

// ---- Rooms ----
export const addRoom = asyncHandler(async (req, res) => {
  const data = await propertyService.addRoomToProperty({
    ownerUserId: req.user.id,
    propertyId: req.params.id,
    data: req.body,
  });
  return sendSuccess(res, { statusCode: 201, message: data.message, data: data.room });
});

export const updateRoom = asyncHandler(async (req, res) => {
  const data = await propertyService.updatePropertyRoom({
    ownerUserId: req.user.id,
    roomId: req.params.roomId,
    data: req.body,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: data.room });
});

export const deleteRoom = asyncHandler(async (req, res) => {
  const data = await propertyService.deletePropertyRoom({
    ownerUserId: req.user.id,
    roomId: req.params.roomId,
  });
  return sendSuccess(res, { statusCode: 200, message: data.message, data: null });
});
