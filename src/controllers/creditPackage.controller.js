import * as service from '../services/creditPackage/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const create = asyncHandler(async (req, res) => sendSuccess(res, {
  statusCode: 201, message: 'Credit package created.',
  data: await service.createCreditPackage(req.body),
}));

export const update = asyncHandler(async (req, res) => sendSuccess(res, {
  message: 'Credit package updated.',
  data: await service.updateCreditPackage({ id: req.params.id, data: req.body }),
}));

export const remove = asyncHandler(async (req, res) => sendSuccess(res, {
  message: 'Credit package deleted.',
  data: await service.deleteCreditPackage(req.params.id),
}));

export const get = asyncHandler(async (req, res) => sendSuccess(res, {
  message: 'Credit package retrieved.', data: await service.getCreditPackage(req.params.id),
}));

export const listAdmin = asyncHandler(async (req, res) => sendSuccess(res, {
  message: 'Credit packages retrieved.', data: await service.listCreditPackagesForAdmin(req.query),
}));

export const listVendor = asyncHandler(async (_req, res) => sendSuccess(res, {
  message: 'Available credit packages retrieved.', data: await service.listActiveCreditPackages(),
}));
