import prisma from '../config/db.js';

const LEAD_PUBLIC_SELECT = {
  id: true,
  destination: true,
  email: true,           // masked downstream when not unlocked
  phone: true,           // masked downstream when not unlocked
  budget: true,
  requirements: true,
  status: true,
  priceInCredits: true,
  maxUnlocks: true,
  unlockCount: true,
  createdAt: true,
};

export const createLead = async ({
  destination,
  email,
  phone,
  budget,
  customerUserId,
  requirements,
}) => {
  return prisma.lead.create({
    data: {
      destination,
      email,
      phone,
      budget,
      customerUserId,
      requirements,
      // status defaults to PENDING_REVIEW - admin must approve before it
      // appears on the marketplace feed.
    },
    select: { id: true, status: true, createdAt: true },
  });
};

export const findLeadById = async (id) => {
  return prisma.lead.findUnique({
    where: { id },
    select: LEAD_PUBLIC_SELECT,
  });
};

export const listActiveLeads = async ({ destination, take, skip }) => {
  const where = { status: 'ACTIVE' };
  if (destination) {
    where.destination = { contains: destination, mode: 'insensitive' };
  }

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      select: LEAD_PUBLIC_SELECT,
    }),
    prisma.lead.count({ where }),
  ]);

  return { items, total };
};

export const findVendorAssignmentLeadIds = async ({ vendorUserId, leadIds }) => {
  if (!leadIds.length) return new Set();
  const rows = await prisma.leadAssignment.findMany({
    where: { vendorUserId, leadId: { in: leadIds } },
    select: { leadId: true },
  });
  return new Set(rows.map((r) => r.leadId));
};

// ----------------------------------------------------------------------------
//   Customer dashboard — list own leads + auto-claim anonymous leads at signup
// ----------------------------------------------------------------------------

// Slim per-lead shape for the customer's "My Inquiries" dashboard. Notice we
// do NOT expose which vendors unlocked the lead — just the count. The full
// vendor identities are paid-for data they only get visible to those vendors.
const CUSTOMER_LEAD_SELECT = {
  id: true,
  destination: true,
  budget: true,
  requirements: true,
  status: true,
  priceInCredits: true,
  maxUnlocks: true,
  unlockCount: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Bulk-assign every orphaned lead with this email to the newly-registered
 * customer. Runs in one atomic UPDATE — fast (indexed on email) and safe.
 * Returns the count of claimed rows so the caller can report it.
 *
 * Note: only touches leads where customerUserId IS NULL — we never steal a
 * lead that's already attributed to someone else.
 */
export const claimLeadsForEmail = async ({ userId, email }) => {
  const result = await prisma.lead.updateMany({
    where: { email, customerUserId: null },
    data: { customerUserId: userId },
  });
  return result.count;
};

/**
 * Paginated list of leads owned by the given customer (current user).
 * Used by GET /api/v1/client/leads for the customer's "My Inquiries" page.
 */
export const listLeadsByCustomer = async ({ customerUserId, take, skip }) => {
  const where = { customerUserId };
  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      select: CUSTOMER_LEAD_SELECT,
    }),
    prisma.lead.count({ where }),
  ]);
  return { items, total };
};
