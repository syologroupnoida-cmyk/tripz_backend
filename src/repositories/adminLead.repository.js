import prisma from '../config/db.js';

// Slim columns shown in the admin leads table.
const LEAD_LIST_SELECT = {
  id: true,
  destination: true,
  email: true,
  phone: true,
  budget: true,
  status: true,
  priceInCredits: true,
  maxUnlocks: true,
  unlockCount: true,
  reviewedAt: true,
  reviewedByAdminId: true,
  rejectionReason: true,
  createdAt: true,
  customerUserId: true,
};

// Customer fields included on the detail view (enough to identify them).
const CUSTOMER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  createdAt: true,
};

// Assignment columns shown on the detail view ("which vendors unlocked this lead").
const ASSIGNMENT_SELECT = {
  id: true,
  vendorUserId: true,
  priceInCreditsPaid: true,
  unlockedAt: true,
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
};

/**
 * Paginated + filterable list for the admin leads dashboard.
 *
 * All filters are optional. Range filters (priceMin/priceMax, budgetMin/Max,
 * unlockCountMin/Max, createdFrom/To, reviewedFrom/To) can be sent in any
 * combination — the Prisma `gte`/`lte` clauses are merged into a single
 * range object per column.
 */
export const listLeadsForAdmin = async ({
  status,
  destination,
  search,
  priceMin,
  priceMax,
  maxUnlocks,
  unlockCountMin,
  unlockCountMax,
  budgetMin,
  budgetMax,
  createdFrom,
  createdTo,
  reviewedFrom,
  reviewedTo,
  sortBy,
  order,
  take,
  skip,
}) => {
  const where = {};

  if (status) where.status = status;
  if (destination) {
    where.destination = { contains: destination, mode: 'insensitive' };
  }
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { destination: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Helper to fold a min/max pair into Prisma's { gte, lte } shape.
  const range = (min, max) => {
    const r = {};
    if (min !== undefined) r.gte = min;
    if (max !== undefined) r.lte = max;
    return Object.keys(r).length ? r : undefined;
  };

  const priceRange = range(priceMin, priceMax);
  if (priceRange) where.priceInCredits = priceRange;

  if (maxUnlocks !== undefined) where.maxUnlocks = maxUnlocks;

  const unlockRange = range(unlockCountMin, unlockCountMax);
  if (unlockRange) where.unlockCount = unlockRange;

  const budgetRange = range(budgetMin, budgetMax);
  if (budgetRange) where.budget = budgetRange;

  const createdRange = range(createdFrom, createdTo);
  if (createdRange) where.createdAt = createdRange;

  const reviewedRange = range(reviewedFrom, reviewedTo);
  if (reviewedRange) where.reviewedAt = reviewedRange;

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { [sortBy]: order },
      take,
      skip,
      select: LEAD_LIST_SELECT,
    }),
    prisma.lead.count({ where }),
  ]);

  return { items, total };
};

/**
 * Full lead detail for the admin detail page — includes customer + all unlocks.
 */
export const getLeadDetailForAdmin = async (leadId) => {
  return prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      customer: { select: CUSTOMER_SELECT },
      assignments: { select: ASSIGNMENT_SELECT, orderBy: { unlockedAt: 'desc' } },
    },
  });
};

// ---- State-change writers — each one is a guarded transition ----

/**
 * CAS-style state change: only succeeds if the lead is currently in `expectedStatus`.
 * Returns `{ updated, lead, currentStatus, notFound }`.
 */
const transitionLeadStatus = async ({
  leadId,
  expectedStatus,
  nextStatus,
  adminId,
  reason,
  extraData = {},
}) => {
  const result = await prisma.lead.updateMany({
    where: { id: leadId, status: expectedStatus },
    data: {
      status: nextStatus,
      reviewedAt: new Date(),
      reviewedByAdminId: adminId,
      ...(reason !== undefined ? { rejectionReason: reason } : {}),
      ...extraData,
    },
  });

  if (result.count === 1) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: LEAD_LIST_SELECT,
    });
    return { updated: true, lead };
  }

  // No update — figure out why so the caller can throw the right error.
  const existing = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { status: true },
  });
  if (!existing) return { updated: false, notFound: true };
  return { updated: false, currentStatus: existing.status };
};

export const approveLead = async ({ leadId, adminId, priceInCredits, maxUnlocks }) => {
  const extraData = {};
  if (priceInCredits !== undefined) extraData.priceInCredits = priceInCredits;
  if (maxUnlocks !== undefined) extraData.maxUnlocks = maxUnlocks;
  return transitionLeadStatus({
    leadId,
    expectedStatus: 'PENDING_REVIEW',
    nextStatus: 'ACTIVE',
    adminId,
    reason: null, // approval clears any prior rejection note
    extraData,
  });
};

export const rejectLead = async ({ leadId, adminId, reason }) =>
  transitionLeadStatus({
    leadId,
    expectedStatus: 'PENDING_REVIEW',
    nextStatus: 'REJECTED',
    adminId,
    reason,
  });

export const closeLead = async ({ leadId, adminId, reason }) =>
  transitionLeadStatus({
    leadId,
    expectedStatus: 'ACTIVE',
    nextStatus: 'CLOSED',
    adminId,
    reason: reason ?? null,
  });

// Manual expiry — fallback until the auto-expiry cron job is built. Same
// CAS guard as close: lead must be currently ACTIVE.
export const expireLead = async ({ leadId, adminId, reason }) =>
  transitionLeadStatus({
    leadId,
    expectedStatus: 'ACTIVE',
    nextStatus: 'EXPIRED',
    adminId,
    reason: reason ?? null,
  });

// Atomic revert ACTIVE → PENDING_REVIEW (mistake-undo for accidental approval).
// Only succeeds when the lead is currently ACTIVE AND no vendor has unlocked
// yet (`unlockCount === 0`). Once a vendor has paid, reverting would lie about
// the lead's history — admin must use CLOSED instead.
//
// Returns `{ updated, lead, currentStatus, currentUnlockCount, notFound }`.
export const revertLeadToPendingReview = async ({ leadId, adminId, reason }) => {
  const result = await prisma.lead.updateMany({
    where: {
      id: leadId,
      status: 'ACTIVE',
      unlockCount: 0,
    },
    data: {
      status: 'PENDING_REVIEW',
      // Clear out the prior review trail so the next reviewer sees a clean queue entry.
      reviewedAt: null,
      reviewedByAdminId: null,
      rejectionReason: reason ?? null,
    },
  });

  if (result.count === 1) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: LEAD_LIST_SELECT,
    });
    return { updated: true, lead };
  }

  // Figure out which guard failed.
  const existing = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { status: true, unlockCount: true },
  });
  if (!existing) return { updated: false, notFound: true };
  return {
    updated: false,
    currentStatus: existing.status,
    currentUnlockCount: existing.unlockCount,
  };
};

/**
 * Atomic pricing update — only succeeds if the lead is in PENDING_REVIEW or
 * ACTIVE state AND `unlockCount === 0` (no vendor has paid yet).
 *
 * Returns `{ updated, lead, currentStatus, currentUnlockCount, notFound }`.
 */
export const updateLeadPricing = async ({ leadId, priceInCredits, maxUnlocks }) => {
  const data = {};
  if (priceInCredits !== undefined) data.priceInCredits = priceInCredits;
  if (maxUnlocks !== undefined) data.maxUnlocks = maxUnlocks;

  const result = await prisma.lead.updateMany({
    where: {
      id: leadId,
      status: { in: ['PENDING_REVIEW', 'ACTIVE'] },
      unlockCount: 0,
    },
    data,
  });

  if (result.count === 1) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: LEAD_LIST_SELECT,
    });
    return { updated: true, lead };
  }

  const existing = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { status: true, unlockCount: true },
  });
  if (!existing) return { updated: false, notFound: true };
  return {
    updated: false,
    currentStatus: existing.status,
    currentUnlockCount: existing.unlockCount,
  };
};
