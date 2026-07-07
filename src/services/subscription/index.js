// =============================================================================
//   Subscription — plan catalog + vendor subscription lifecycle
// =============================================================================
//
// Two surfaces:
//   • Plan catalog (super-admin CRUD, admin/vendor read)
//   • Vendor subscription actions (buy / upgrade / view current / history)
//
// Upgrade pricing model — "Add Days":
//   When a vendor upgrades mid-cycle, the leftover value of their current
//   plan is converted into bonus days on the new plan at the new plan's
//   daily rate. Vendor pays full new-plan price up front (no proration on
//   money), gets extra time instead. This keeps Razorpay integration simple
//   (single order per purchase) and avoids partial-refund complexity.
//
// Credits on upgrade — additive:
//   New plan's `includedCredits` are added to the wallet on top of whatever
//   the vendor already had. Old credits never expire and never get wiped by
//   plan changes. Fair to the vendor and matches the "wallet is separate
//   from subscription" mental model.
// =============================================================================

import { ApiError } from '../../utils/ApiError.js';
import * as subscriptionRepo from '../../repositories/subscription.repository.js';

const MS_PER_DAY = 86400000;

// -----------------------------------------------------------------------------
//   Helpers
// -----------------------------------------------------------------------------

/**
 * Convert a plan name into a URL-friendly slug.
 *   "Basic Brown Plan" → "basic-brown-plan"
 *   "Advance Silver — 2026" → "advance-silver-2026"
 *
 * Non-alphanumerics collapse to single hyphens; leading/trailing hyphens trim.
 */
const slugify = (raw) =>
  String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/**
 * Produce a unique slug for a plan by appending -2, -3, ... if the base slug
 * is already taken (including by soft-deleted rows, so we never reuse a
 * retired plan's URL — matters for SEO history).
 */
const generateUniqueSlug = async (baseName, { excludePlanId = null } = {}) => {
  const base = slugify(baseName) || 'plan';
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await subscriptionRepo.getPlanBySlug(candidate);
    if (!existing || existing.id === excludePlanId) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
    if (n > 50) {
      // Bail-out — extreme collision. Shouldn't happen in practice.
      return `${base}-${Date.now()}`;
    }
  }
};

/**
 * Add-Days formula.
 *
 *   remainingValue = (daysRemaining / oldPlan.durationDays) * oldPlan.offerPriceInPaise
 *   bonusDays      = ceil(remainingValue / newPlan.dailyRate)
 *
 * Rounded up so the vendor never loses a partial day's worth of value.
 * If the old sub is already past expiry, remainingValue is 0 → 0 bonus days.
 *
 * Uses `offerPriceInPaise` (what the vendor actually paid) — not
 * `salePriceInPaise` — so vendors only get credit for money that actually
 * changed hands.
 */
const calculateBonusDays = ({ oldSubExpiresAt, oldPlan, newPlan }) => {
  const now = Date.now();
  const expiresMs = new Date(oldSubExpiresAt).getTime();
  const daysRemaining = Math.max(0, (expiresMs - now) / MS_PER_DAY);
  if (daysRemaining === 0) return 0;

  const remainingValue = (daysRemaining / oldPlan.durationDays) * oldPlan.offerPriceInPaise;
  const newDailyRate = newPlan.offerPriceInPaise / newPlan.durationDays;
  if (newDailyRate <= 0) return 0;

  return Math.ceil(remainingValue / newDailyRate);
};

/**
 * "Effective status" for a subscription — honours the DB status but overrides
 * to EXPIRED if the row is still marked ACTIVE past its expiresAt. Lets the
 * frontend show accurate state before the expiry cron catches up.
 */
const effectiveStatusFor = (subscription) => {
  if (!subscription) return null;
  if (subscription.status === 'ACTIVE' && new Date(subscription.expiresAt) < new Date()) {
    return 'EXPIRED';
  }
  return subscription.status;
};

const decorate = (subscription) =>
  subscription
    ? { ...subscription, effectiveStatus: effectiveStatusFor(subscription) }
    : null;

// -----------------------------------------------------------------------------
//   Plan catalog — super-admin CRUD
// -----------------------------------------------------------------------------

export const createPlan = async (data) => {
  // Auto-generate a URL-friendly, collision-free slug from the plan name.
  // Admin doesn't have to think about slugs — the pricing page uses `name`
  // for display anyway. Slugs matter for SEO-friendly URLs later.
  const slug = await generateUniqueSlug(data.name);
  return subscriptionRepo.createPlan({ ...data, slug });
};

/**
 * Update a plan's fields. Also handles the isActive toggle — pass
 * `isActive: false` to deactivate (reversible hide), `isActive: true` to
 * reactivate. Soft-deleted plans cannot be modified at all — attempts get
 * a specific PLAN_DELETED error rather than a bare 404 so the caller
 * knows the plan is retired forever.
 */
export const updatePlan = async (planId, data) => {
  // Peek across the deleted-filter so we can distinguish "deleted" from
  // "never existed" and return a more specific error for the deleted case.
  const existing = await subscriptionRepo.getPlanById(planId, { includeDeleted: true });
  if (!existing) {
    throw ApiError.notFound('Subscription plan not found.');
  }
  if (existing.deletedAt) {
    throw new ApiError(400, 'Cannot modify a deleted plan.', {
      code: 'PLAN_DELETED',
    });
  }

  // If the name is being changed, regenerate the slug so it stays consistent
  // with the display name (excluding the current plan from the uniqueness
  // check so renaming to the same words doesn't collide with itself).
  const patch = { ...data };
  if (data.name && data.name !== existing.name) {
    patch.slug = await generateUniqueSlug(data.name, { excludePlanId: planId });
  }

  return subscriptionRepo.updatePlan(planId, patch);
};

/**
 * Soft delete a plan. Existing vendor subscriptions run to their natural
 * expiresAt — deletion just retires the catalog entry.
 *
 * `reason` is optional and only logged for audit; the plan row itself
 * doesn't carry a delete-reason field (Phase 1 keeps the schema lean).
 */
export const deletePlan = async ({ planId, adminId, reason }) => {
  // Peek across the deleted-filter so we can distinguish "already deleted"
  // (idempotent OK) from "not found" (404).
  const existing = await subscriptionRepo.getPlanById(planId, { includeDeleted: true });
  if (!existing) {
    throw ApiError.notFound('Subscription plan not found.');
  }
  if (existing.deletedAt) {
    // Idempotent — plan is already retired, return current state.
    return existing;
  }

  const deleted = await subscriptionRepo.softDeletePlan(planId);

  console.log(
    `[admin-audit] DELETE_PLAN plan=${planId} by admin=${adminId} reason="${reason ?? '(none)'}"`,
  );

  return deleted;
};

// -----------------------------------------------------------------------------
//   Plan reads (admin + vendor)
// -----------------------------------------------------------------------------

export const listPlansForAdmin = async (query) => {
  const { items, total } = await subscriptionRepo.listPlansForAdmin(query);
  return { items, total, take: query.take, skip: query.skip };
};

/**
 * Vendor-facing plan catalog. When `vendorUserId` is supplied (authenticated
 * `/vendor/subscription-plans` route), each plan is enriched with a
 * per-vendor `action` field so the frontend can render the right CTA:
 *
 *   • BUY               — no active sub, fresh purchase
 *   • CURRENT           — the vendor is on this plan right now
 *   • UPGRADE_TO        — this plan is priced above the current one
 *   • DOWNGRADE_BLOCKED — this plan is priced below current (blocked by the
 *                          upgrade endpoint's downgrade guard)
 *
 * When `vendorUserId` is null (public `/subscription-plans` route), every plan
 * gets `action: 'BUY'` and `currentSubscription` is null so the marketing
 * page can render "Choose <plan>" for anyone.
 */
export const listActivePlansForVendor = async ({ vendorUserId = null } = {}) => {
  const items = await subscriptionRepo.listActivePlansForVendor();

  // Public / anonymous — no vendor context to overlay.
  if (!vendorUserId) {
    return {
      items: items.map((plan) => ({ ...plan, isCurrentPlan: false, action: 'BUY' })),
      total: items.length,
      currentSubscription: null,
    };
  }

  // Vendor-scoped — resolve their current subscription and label each plan.
  const currentSub = await subscriptionRepo.findActiveSubscriptionForVendor(vendorUserId);
  const isSubLive = currentSub && effectiveStatusFor(currentSub) === 'ACTIVE';
  const currentPlanPrice = isSubLive ? (currentSub.plan?.offerPriceInPaise ?? 0) : null;
  const currentPlanId = isSubLive ? currentSub.planId : null;

  const enriched = items.map((plan) => {
    let action;
    let isCurrentPlan = false;

    if (!isSubLive) {
      // No active sub → any plan is a fresh buy.
      action = 'BUY';
    } else if (plan.id === currentPlanId) {
      action = 'CURRENT';
      isCurrentPlan = true;
    } else if (plan.offerPriceInPaise > currentPlanPrice) {
      action = 'UPGRADE_TO';
    } else {
      // Cheaper than or equal to the current plan — blocked by the same rule
      // that guards POST /vendor/subscriptions/upgrade.
      action = 'DOWNGRADE_BLOCKED';
    }

    return { ...plan, isCurrentPlan, action };
  });

  return {
    items: enriched,
    total: enriched.length,
    currentSubscription: isSubLive ? decorate(currentSub) : null,
  };
};

export const getPlanDetail = async (planId) => {
  const plan = await subscriptionRepo.getPlanById(planId);
  if (!plan) {
    throw ApiError.notFound('Subscription plan not found.');
  }
  return plan;
};

// -----------------------------------------------------------------------------
//   Vendor — buy / upgrade / current / history
// -----------------------------------------------------------------------------

/**
 * Fresh buy — vendor must NOT have an ACTIVE sub already.
 * Direct-buy MVP flow (no payment gateway yet). Razorpay verify step will
 * slot in before repository call once payments are wired.
 */
export const buySubscription = async ({ vendorUserId, planId }) => {
  const plan = await subscriptionRepo.getPlanById(planId);
  if (!plan || !plan.isActive) {
    throw ApiError.notFound('Subscription plan not found or is inactive.');
  }

  const currentActive = await subscriptionRepo.findActiveSubscriptionForVendor(vendorUserId);
  if (currentActive && effectiveStatusFor(currentActive) === 'ACTIVE') {
    throw new ApiError(409, 'You already have an active subscription. Use upgrade instead.', {
      code: 'ACTIVE_SUBSCRIPTION_EXISTS',
      currentSubscriptionId: currentActive.id,
    });
  }

  const result = await subscriptionRepo.createFreshSubscription({ vendorUserId, plan });

  return {
    subscription: decorate(result.subscription),
    walletBalanceAfter: result.walletBalanceAfter,
    message: `Subscribed to ${plan.name}. ${plan.includedCredits} credits added.`,
  };
};

/**
 * Upgrade — vendor MUST have an ACTIVE sub; new plan must be different and
 * priced ≥ current plan (downgrades are blocked for Phase 1 — will get their
 * own deferred flow in Phase 2 when packages arrive).
 *
 * Bonus days from the Add-Days formula are baked into the new sub's
 * expiresAt in a single transaction.
 */
export const upgradeSubscription = async ({ vendorUserId, planId }) => {
  const newPlan = await subscriptionRepo.getPlanById(planId);
  if (!newPlan || !newPlan.isActive) {
    throw ApiError.notFound('Subscription plan not found or is inactive.');
  }

  const currentSub = await subscriptionRepo.findActiveSubscriptionForVendor(vendorUserId);
  if (!currentSub) {
    throw ApiError.badRequest('No active subscription to upgrade. Please buy a plan first.');
  }
  if (effectiveStatusFor(currentSub) !== 'ACTIVE') {
    throw ApiError.badRequest('Your current subscription has expired. Please buy a fresh plan.');
  }

  const oldPlan = currentSub.plan;
  if (oldPlan.id === newPlan.id) {
    throw ApiError.badRequest('You are already on this plan.');
  }
  if (newPlan.offerPriceInPaise < oldPlan.offerPriceInPaise) {
    throw new ApiError(400, 'Downgrades are not supported yet.', {
      code: 'DOWNGRADE_BLOCKED',
      currentPlanPriceInPaise: oldPlan.offerPriceInPaise,
      requestedPlanPriceInPaise: newPlan.offerPriceInPaise,
    });
  }

  const bonusDays = calculateBonusDays({
    oldSubExpiresAt: currentSub.expiresAt,
    oldPlan,
    newPlan,
  });

  let result;
  try {
    result = await subscriptionRepo.upgradeSubscription({
      vendorUserId,
      oldSubscriptionId: currentSub.id,
      newPlan,
      bonusDays,
    });
  } catch (err) {
    if (err.message === 'OLD_SUB_NOT_ACTIVE') {
      throw new ApiError(409, 'Subscription state changed. Please retry.', {
        code: 'CONCURRENT_UPGRADE',
      });
    }
    throw err;
  }

  return {
    subscription: decorate(result.newSubscription),
    previousSubscriptionId: result.oldSubscriptionId,
    bonusDaysGranted: bonusDays,
    walletBalanceAfter: result.walletBalanceAfter,
    message: `Upgraded to ${newPlan.name}. ${bonusDays} bonus day(s) added from remaining ${oldPlan.name} value.`,
  };
};

/**
 * Vendor's current subscription (if any). Reports `effectiveStatus` so the
 * frontend gets accurate expiry even before the daily cron flips DB status.
 */
export const getCurrentSubscription = async (vendorUserId) => {
  const sub = await subscriptionRepo.findActiveSubscriptionForVendor(vendorUserId);
  if (!sub) {
    return { subscription: null };
  }
  return { subscription: decorate(sub) };
};

/**
 * Vendor's own subscription history (any status) — paginated.
 */
export const getSubscriptionHistory = async ({ vendorUserId, take, skip }) => {
  const { items, total } = await subscriptionRepo.listSubscriptionsForVendor({
    vendorUserId,
    take,
    skip,
  });
  return {
    items: items.map(decorate),
    total,
    take,
    skip,
  };
};

// -----------------------------------------------------------------------------
//   Admin — monitor + force-cancel
// -----------------------------------------------------------------------------

export const listAllSubscriptions = async (query) => {
  const { items, total } = await subscriptionRepo.listAllSubscriptionsForAdmin(query);
  return {
    items: items.map(decorate),
    total,
    take: query.take,
    skip: query.skip,
  };
};

export const getSubscriptionDetail = async (subscriptionId) => {
  const sub = await subscriptionRepo.getSubscriptionById(subscriptionId);
  if (!sub) {
    throw ApiError.notFound('Subscription not found.');
  }
  return decorate(sub);
};

export const cancelSubscriptionAsAdmin = async ({ subscriptionId, adminId, reason }) => {
  const result = await subscriptionRepo.forceCancelSubscription({ subscriptionId, adminId });

  if (!result.updated) {
    if (result.notFound) throw ApiError.notFound('Subscription not found.');
    throw new ApiError(
      409,
      `Cannot cancel a subscription that is currently ${result.currentStatus}.`,
      { code: 'SUB_NOT_ACTIVE', currentStatus: result.currentStatus },
    );
  }

  // Phase-1 audit — plain log until a dedicated audit_log table lands.
  console.log(
    `[admin-audit] CANCEL_SUBSCRIPTION sub=${subscriptionId} by admin=${adminId} reason="${reason}"`,
  );

  return {
    subscription: decorate(result.subscription),
    message: 'Subscription cancelled.',
  };
};
