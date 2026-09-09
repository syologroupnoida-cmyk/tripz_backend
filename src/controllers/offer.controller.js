import * as offerService from '../services/offer/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const createOffer = asyncHandler(async (req, res) => {
  const data = await offerService.createOffer({ data: req.body, adminId: req.user.id });
  return sendSuccess(res, { statusCode: 201, message: 'Offer created.', data });
});

export const updateOffer = asyncHandler(async (req, res) => {
  const data = await offerService.updateOffer({ id: req.params.id, data: req.body });
  return sendSuccess(res, { message: 'Offer updated.', data });
});

export const listOffersAdmin = asyncHandler(async (req, res) => {
  const data = await offerService.listOffers(req.query);
  return sendSuccess(res, { message: 'Offers retrieved.', data });
});

export const getOfferAdmin = asyncHandler(async (req, res) => {
  const data = await offerService.getOffer(req.params.id);
  return sendSuccess(res, { message: 'Offer retrieved.', data });
});

export const deleteOffer = asyncHandler(async (req, res) => {
  const data = await offerService.deleteOffer(req.params.id);
  return sendSuccess(res, { message: 'Offer deleted.', data });
});

export const activateOffer = asyncHandler(async (req, res) => {
  const data = await offerService.setOfferStatus({ id: req.params.id, status: 'ACTIVE' });
  return sendSuccess(res, { message: 'Offer activated.', data });
});

export const pauseOffer = asyncHandler(async (req, res) => {
  const data = await offerService.setOfferStatus({ id: req.params.id, status: 'PAUSED' });
  return sendSuccess(res, { message: 'Offer paused.', data });
});

export const importOffersCsv = asyncHandler(async (req, res) => {
  const data = await offerService.importOffersCsv({
    file: req.file,
    mode: req.body?.mode ?? req.query?.mode ?? 'validate',
    adminId: req.user.id,
  });
  return sendSuccess(res, {
    statusCode: data.mode === 'import' ? 201 : 200,
    message: data.mode === 'import' ? 'Offer import completed.' : 'Offer CSV validated.',
    data,
  });
});

export const listOffersPublic = asyncHandler(async (req, res) => {
  const data = await offerService.listOffers(req.query, { publicOnly: true });
  return sendSuccess(res, { message: 'Offers retrieved.', data });
});

export const validateCoupon = asyncHandler(async (req, res) => {
  const data = await offerService.validateCoupon({ customerUserId: req.user.id, data: req.body });
  return sendSuccess(res, { message: 'Coupon is valid.', data });
});
