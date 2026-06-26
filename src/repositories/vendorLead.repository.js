import prisma from '../config/db.js';

// Each unlocked lead shows: how much the vendor paid + when + the full lead.
// The lead's contact info is included unmasked — the vendor paid for it.
const ASSIGNMENT_WITH_LEAD_SELECT = {
  id: true,
  leadId: true,
  priceInCreditsPaid: true,
  unlockedAt: true,
  walletTransactionId: true,
  lead: {
    select: {
      id: true,
      destination: true,
      email: true, // unmasked — vendor paid for this
      phone: true, // unmasked
      budget: true,
      requirements: true,
      status: true,
      priceInCredits: true,
      maxUnlocks: true,
      unlockCount: true,
      createdAt: true,
    },
  },
};

/**
 * Vendor's purchase history — list of leads they've unlocked.
 * Newest unlocks first.
 */
export const listUnlockedLeadsForVendor = async ({ vendorUserId, take, skip }) => {
  const where = { vendorUserId };

  const [items, total] = await Promise.all([
    prisma.leadAssignment.findMany({
      where,
      orderBy: { unlockedAt: 'desc' },
      take,
      skip,
      select: ASSIGNMENT_WITH_LEAD_SELECT,
    }),
    prisma.leadAssignment.count({ where }),
  ]);
  return { items, total };
};

/**
 * Fetch a single unlocked lead by assignment id.
 * Scoped to the vendor — they can't view another vendor's unlock.
 */
export const findUnlockedLeadForVendor = async ({ vendorUserId, assignmentId }) => {
  return prisma.leadAssignment.findFirst({
    where: { id: assignmentId, vendorUserId },
    select: ASSIGNMENT_WITH_LEAD_SELECT,
  });
};
