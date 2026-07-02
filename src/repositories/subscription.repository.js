import prisma from '../config/db.js';

// -----------------------------------------------------------------------------
//   PLAN CATALOG — super-admin manages, admin reads
// -----------------------------------------------------------------------------

// Public-safe columns exposed to any caller (vendor, admin).
const PLAN_PUBLIC_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,

  // Pricing
  salePriceInPaise: true,
  offerPriceInPaise: true,
  billingCycle: true,
  durationDays: true,
  trialDays: true,

  // Business logic
  includedCredits: true,
  maxPackages: true,
  directLeadPriceCredits: true,
  priorityWeight: true,

  // Display flags
  isFeatured: true,
  displayOrder: true,
  isActive: true,
  deletedAt: true,

  // Content
  displayContent: true,
  rules: true,

  createdAt: true,
  updatedAt: true,
};

export const createPlan = async (data) => {
  return prisma.subscriptionPlan.create({
    data,
    select: PLAN_PUBLIC_SELECT,
  });
};

export const updatePlan = async (id, data) => {
  return prisma.subscriptionPlan.update({
    where: { id },
    data,
    select: PLAN_PUBLIC_SELECT,
  });
};

/**
 * Soft delete — stamps deletedAt and force-flips isActive off.
 * Existing vendor subscriptions on this plan are untouched (they run to
 * their natural expiresAt); the plan just vanishes from the catalog.
 */
export const softDeletePlan = async (id) => {
  return prisma.subscriptionPlan.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
    select: PLAN_PUBLIC_SELECT,
  });
};

/**
 * Fetch a plan by id. Skips soft-deleted rows by default so services can't
 * accidentally act on retired plans; pass `{ includeDeleted: true }` for
 * audit reads or when validating the delete/activate paths themselves.
 */
export const getPlanById = async (id, { includeDeleted = false } = {}) => {
  const where = { id };
  if (!includeDeleted) where.deletedAt = null;
  return prisma.subscriptionPlan.findFirst({
    where,
    select: PLAN_PUBLIC_SELECT,
  });
};

/**
 * Slug lookup — used for slug uniqueness checks during create/update.
 * Includes soft-deleted rows so we don't accidentally reuse a retired slug.
 */
export const getPlanBySlug = async (slug) => {
  return prisma.subscriptionPlan.findUnique({
    where: { slug },
    select: { id: true, slug: true, deletedAt: true },
  });
};

/**
 * Admin listing — supports isActive filter and pagination. Soft-deleted
 * plans are excluded by default; pass includeDeleted=true for audit view.
 */
export const listPlansForAdmin = async ({
  isActive,
  includeDeleted,
  take,
  skip,
  sortBy,
  order,
}) => {
  const where = {};
  if (typeof isActive === 'boolean') where.isActive = isActive;
  if (!includeDeleted) where.deletedAt = null;

  const [items, total] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where,
      orderBy: { [sortBy]: order },
      take,
      skip,
      select: PLAN_PUBLIC_SELECT,
    }),
    prisma.subscriptionPlan.count({ where }),
  ]);

  return { items, total };
};

/**
 * Vendor-facing catalog — only live (`isActive` AND non-deleted) plans,
 * ordered by admin-controlled displayOrder so the UI renders in the exact
 * sequence the admin picked on the pricing page (Basic → Silver → Gold).
 */
export const listActivePlansForVendor = async () => {
  return prisma.subscriptionPlan.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ displayOrder: 'asc' }, { offerPriceInPaise: 'asc' }],
    select: PLAN_PUBLIC_SELECT,
  });
};

// -----------------------------------------------------------------------------
//   VENDOR SUBSCRIPTIONS
// -----------------------------------------------------------------------------

const SUBSCRIPTION_SELECT = {
  id: true,
  vendorUserId: true,
  planId: true,
  status: true,
  startsAt: true,
  expiresAt: true,
  cancelledAt: true,
  cancelledBy: true,
  replacedBySubscriptionId: true,
  creditsGranted: true,
  bonusDays: true,
  paymentRef: true,
  createdAt: true,
  updatedAt: true,
  plan: { select: PLAN_PUBLIC_SELECT },
};

/**
 * Fresh buy — creates the VendorSubscription row and grants credits atomically.
 *
 * Steps in a single transaction:
 *   1. Insert VendorSubscription (status = ACTIVE).
 *   2. Upsert wallet (0 balance if absent).
 *   3. Increment wallet.balanceCredits by plan.includedCredits.
 *   4. Write a WalletTransaction ledger row (CREDIT_SUBSCRIPTION_GRANT).
 *
 * Caller is responsible for the "no active sub" precondition — the service
 * layer checks that before invoking us.
 */
export const createFreshSubscription = async ({ vendorUserId, plan }) => {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + plan.durationDays * 86400000);

    const subscription = await tx.vendorSubscription.create({
      data: {
        vendorUserId,
        planId: plan.id,
        status: 'ACTIVE',
        startsAt: now,
        expiresAt,
        creditsGranted: plan.includedCredits,
        bonusDays: 0,
      },
      select: SUBSCRIPTION_SELECT,
    });

    // Ensure wallet exists before crediting.
    await tx.wallet.upsert({
      where: { vendorUserId },
      create: { vendorUserId },
      update: {},
    });

    let walletAfter = { balanceCredits: 0 };
    if (plan.includedCredits > 0) {
      const updated = await tx.wallet.update({
        where: { vendorUserId },
        data: { balanceCredits: { increment: plan.includedCredits } },
        select: { balanceCredits: true },
      });
      walletAfter = updated;

      await tx.walletTransaction.create({
        data: {
          vendorUserId,
          type: 'CREDIT_SUBSCRIPTION_GRANT',
          amount: plan.includedCredits,
          balanceAfter: walletAfter.balanceCredits,
          referenceType: 'SUBSCRIPTION',
          referenceId: subscription.id,
        },
      });
    } else {
      const current = await tx.wallet.findUnique({
        where: { vendorUserId },
        select: { balanceCredits: true },
      });
      walletAfter = current ?? { balanceCredits: 0 };
    }

    return { subscription, walletBalanceAfter: walletAfter.balanceCredits };
  });
};

/**
 * Upgrade — atomically supersede the old subscription with a new one.
 *
 *   1. Flip old sub: status = UPGRADED, cancelledAt = now.
 *   2. Insert new sub with (durationDays + bonusDays) window.
 *   3. Point old.replacedBySubscriptionId → new sub id.
 *   4. Grant new plan's credits (additive).
 *   5. Write CREDIT_SUBSCRIPTION_GRANT ledger row.
 *
 * `bonusDays` is calculated in the service layer via the Add-Days formula.
 */
export const upgradeSubscription = async ({
  vendorUserId,
  oldSubscriptionId,
  newPlan,
  bonusDays,
}) => {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const totalDays = newPlan.durationDays + bonusDays;
    const expiresAt = new Date(now.getTime() + totalDays * 86400000);

    // 1. Mark old sub as UPGRADED. Guarded update — only if still ACTIVE.
    const oldUpdate = await tx.vendorSubscription.updateMany({
      where: { id: oldSubscriptionId, status: 'ACTIVE' },
      data: { status: 'UPGRADED', cancelledAt: now },
    });
    if (oldUpdate.count === 0) {
      // Race — someone else already changed the old sub's status. Rollback.
      throw new Error('OLD_SUB_NOT_ACTIVE');
    }

    // 2. Insert new sub.
    const newSub = await tx.vendorSubscription.create({
      data: {
        vendorUserId,
        planId: newPlan.id,
        status: 'ACTIVE',
        startsAt: now,
        expiresAt,
        creditsGranted: newPlan.includedCredits,
        bonusDays,
      },
      select: SUBSCRIPTION_SELECT,
    });

    // 3. Link old → new for audit trail.
    await tx.vendorSubscription.update({
      where: { id: oldSubscriptionId },
      data: { replacedBySubscriptionId: newSub.id },
    });

    // 4. Wallet upsert + credit grant.
    await tx.wallet.upsert({
      where: { vendorUserId },
      create: { vendorUserId },
      update: {},
    });

    let walletAfter = { balanceCredits: 0 };
    if (newPlan.includedCredits > 0) {
      const updated = await tx.wallet.update({
        where: { vendorUserId },
        data: { balanceCredits: { increment: newPlan.includedCredits } },
        select: { balanceCredits: true },
      });
      walletAfter = updated;

      // 5. Ledger row.
      await tx.walletTransaction.create({
        data: {
          vendorUserId,
          type: 'CREDIT_SUBSCRIPTION_GRANT',
          amount: newPlan.includedCredits,
          balanceAfter: walletAfter.balanceCredits,
          referenceType: 'SUBSCRIPTION',
          referenceId: newSub.id,
        },
      });
    } else {
      const current = await tx.wallet.findUnique({
        where: { vendorUserId },
        select: { balanceCredits: true },
      });
      walletAfter = current ?? { balanceCredits: 0 };
    }

    return {
      newSubscription: newSub,
      oldSubscriptionId,
      walletBalanceAfter: walletAfter.balanceCredits,
    };
  });
};

/**
 * Vendor's currently active subscription (if any). Only ACTIVE rows —
 * EXPIRED / CANCELLED / UPGRADED are excluded.
 *
 * Note: on-the-fly expiry check. If a sub is DB-marked ACTIVE but its
 * expiresAt has passed, the service layer treats it as EXPIRED in responses.
 * The daily expiry cron (Phase 2) will do the actual DB update.
 */
export const findActiveSubscriptionForVendor = async (vendorUserId) => {
  return prisma.vendorSubscription.findFirst({
    where: { vendorUserId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: SUBSCRIPTION_SELECT,
  });
};

export const getSubscriptionById = async (id) => {
  return prisma.vendorSubscription.findUnique({
    where: { id },
    select: SUBSCRIPTION_SELECT,
  });
};

/**
 * Vendor's own subscription history (any status), paginated.
 */
export const listSubscriptionsForVendor = async ({ vendorUserId, take, skip }) => {
  const where = { vendorUserId };
  const [items, total] = await Promise.all([
    prisma.vendorSubscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      select: SUBSCRIPTION_SELECT,
    }),
    prisma.vendorSubscription.count({ where }),
  ]);
  return { items, total };
};

/**
 * Admin listing — filter by status / plan / vendor, paginated.
 */
export const listAllSubscriptionsForAdmin = async ({
  status,
  planId,
  vendorUserId,
  take,
  skip,
  sortBy,
  order,
}) => {
  const where = {};
  if (status) where.status = status;
  if (planId) where.planId = planId;
  if (vendorUserId) where.vendorUserId = vendorUserId;

  const [items, total] = await Promise.all([
    prisma.vendorSubscription.findMany({
      where,
      orderBy: { [sortBy]: order },
      take,
      skip,
      select: {
        ...SUBSCRIPTION_SELECT,
        vendor: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    }),
    prisma.vendorSubscription.count({ where }),
  ]);

  return { items, total };
};

/**
 * Force cancel — only succeeds if sub is currently ACTIVE. Guarded via
 * updateMany so parallel cancels don't race.
 *
 * Returns:
 *   - { updated: true, subscription }  — success
 *   - { updated: false, notFound }     — no such id
 *   - { updated: false, currentStatus } — sub exists but not ACTIVE
 */
export const forceCancelSubscription = async ({ subscriptionId, adminId }) => {
  const now = new Date();
  const result = await prisma.vendorSubscription.updateMany({
    where: { id: subscriptionId, status: 'ACTIVE' },
    data: {
      status: 'CANCELLED',
      cancelledAt: now,
      cancelledBy: adminId,
    },
  });

  if (result.count === 1) {
    const subscription = await prisma.vendorSubscription.findUnique({
      where: { id: subscriptionId },
      select: SUBSCRIPTION_SELECT,
    });
    return { updated: true, subscription };
  }

  const existing = await prisma.vendorSubscription.findUnique({
    where: { id: subscriptionId },
    select: { status: true },
  });
  if (!existing) return { updated: false, notFound: true };
  return { updated: false, currentStatus: existing.status };
};
