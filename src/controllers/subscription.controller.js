import * as subscriptionService from '../services/subscription/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// -----------------------------------------------------------------------------
//   Plan catalog — SUPER_ADMIN write, ADMIN + SUPER_ADMIN read
// -----------------------------------------------------------------------------

export const createPlan = asyncHandler(async (req, res) => {
  const data = await subscriptionService.createPlan(req.body);
  return sendSuccess(res, {
    statusCode: 201,
    message: 'Subscription plan created.',
    data,
  });
});

export const updatePlan = asyncHandler(async (req, res) => {
  const data = await subscriptionService.updatePlan(req.params.id, req.body);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Subscription plan updated.',
    data,
  });
});

export const deletePlan = asyncHandler(async (req, res) => {
  const data = await subscriptionService.deletePlan({
    planId: req.params.id,
    adminId: req.user.id,
    reason: req.body?.reason,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Subscription plan deleted.',
    data,
  });
});

export const listPlansForAdmin = asyncHandler(async (req, res) => {
  const data = await subscriptionService.listPlansForAdmin(req.query);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Subscription plans retrieved.',
    data,
  });
});

export const getPlanDetail = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getPlanDetail(req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Subscription plan retrieved.',
    data,
  });
});

// -----------------------------------------------------------------------------
//   Vendor — catalog + buy + upgrade + current + history
// -----------------------------------------------------------------------------

export const listActivePlansForVendor = asyncHandler(async (req, res) => {
  // `req.user` exists only on the authenticated `/vendor/subscription-plans`
  // route — the public `/subscription-plans` route runs without the auth
  // middleware, so `req.user` is undefined there. When present, the service
  // enriches each plan with `action`/`isCurrentPlan` + a top-level
  // `currentSubscription`. Anonymous callers get plain `action: 'BUY'` rows.
  const data = await subscriptionService.listActivePlansForVendor({
    vendorUserId: req.user?.id ?? null,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Available subscription plans retrieved.',
    data,
  });
});

export const buySubscription = asyncHandler(async (req, res) => {
  const data = await subscriptionService.buySubscription({
    vendorUserId: req.user.id,
    planId: req.body.planId,
  });
  return sendSuccess(res, {
    statusCode: 201,
    message: 'Subscription activated.',
    data,
  });
});

export const upgradeSubscription = asyncHandler(async (req, res) => {
  const data = await subscriptionService.upgradeSubscription({
    vendorUserId: req.user.id,
    planId: req.body.planId,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Subscription upgraded.',
    data,
  });
});

export const getCurrentSubscription = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getCurrentSubscription(req.user.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Current subscription retrieved.',
    data,
  });
});

export const getSubscriptionHistory = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getSubscriptionHistory({
    vendorUserId: req.user.id,
    take: req.query.take,
    skip: req.query.skip,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Subscription history retrieved.',
    data,
  });
});

// -----------------------------------------------------------------------------
//   Admin — monitor + force cancel
// -----------------------------------------------------------------------------

export const listAllSubscriptions = asyncHandler(async (req, res) => {
  const data = await subscriptionService.listAllSubscriptions(req.query);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Subscriptions retrieved.',
    data,
  });
});

export const getSubscriptionDetail = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getSubscriptionDetail(req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Subscription retrieved.',
    data,
  });
});

export const cancelSubscription = asyncHandler(async (req, res) => {
  const data = await subscriptionService.cancelSubscriptionAsAdmin({
    subscriptionId: req.params.id,
    adminId: req.user.id,
    reason: req.body.reason,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Subscription cancelled.',
    data,
  });
});
