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
