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
      departureCity: true,
      travelDate: true,
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

// ---- Direct leads (Phase 2 routing) ----

// Slim lead shape for the "direct leads" inbox. Contact info is masked here
// (matches marketplace behaviour) until the vendor actually unlocks one.
const DIRECT_LEAD_SELECT = {
  id: true,
  destination: true,
  departureCity: true,
  travelDate: true,
  email: true,    // masked downstream by service
  phone: true,    // masked downstream by service
  budget: true,
  requirements: true,
  status: true,
  priceInCredits: true,
  maxUnlocks: true,
  unlockCount: true,
  createdAt: true,
};

/**
 * Vendor's "direct leads" inbox — ACTIVE leads where targetVendorId matches.
 * Excludes already-unlocked leads from this default view; the vendor's own
 * unlock history is served by /vendor/leads/unlocked.
 */
export const listDirectLeadsForVendor = async ({ vendorUserId, take, skip }) => {
  const where = {
    targetVendorId: vendorUserId,
    status: 'ACTIVE',
    // hide ones this vendor has already unlocked
    assignments: { none: { vendorUserId } },
  };

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      select: DIRECT_LEAD_SELECT,
    }),
    prisma.lead.count({ where }),
  ]);
  return { items, total };
};
