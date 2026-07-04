import prisma from '../config/db.js';

const LEAD_PUBLIC_SELECT = {
  id: true,
  destination: true,
  departureCity: true,
  travelDate: true,
  email: true,           // masked downstream when not unlocked
  phone: true,           // masked downstream when not unlocked
  budget: true,
  requirements: true,
  status: true,
  priceInCredits: true,
  maxUnlocks: true,
  unlockCount: true,
  targetVendorId: true,  // exposed so frontend can render "Direct" badge
  packageId: true,       // exposed so frontend can render "From your package" badge
  createdAt: true,
};

/**
 * Insert a new Lead. All routing/pricing overrides are optional — when
 * omitted, Prisma applies model defaults (status=PENDING_REVIEW,
 * priceInCredits=10, maxUnlocks=3, packageId=null).
 *
 * Callers:
 *   • Regular global lead        → base fields only.
 *   • Admin-assigned direct lead → +targetVendorId, +maxUnlocks:1.
 *   • Package inquiry lead       → +packageId, +targetVendorId,
 *                                  +status:'ACTIVE', +priceInCredits,
 *                                  +maxUnlocks:1.
 */
export const createLead = async ({
  destination,
  departureCity,
  travelDate,
  email,
  phone,
  budget,
  customerUserId,
  requirements,
  packageId,
  targetVendorId,
  status,
  priceInCredits,
  maxUnlocks,
}) => {
  return prisma.lead.create({
    data: {
      destination,
      departureCity,
      travelDate,
      email,
      phone,
      budget,
      customerUserId,
      requirements,
      targetVendorId: targetVendorId ?? null,
      ...(packageId ? { packageId } : {}),
      ...(status ? { status } : {}),
      ...(priceInCredits !== undefined ? { priceInCredits } : {}),
      ...(maxUnlocks !== undefined ? { maxUnlocks } : {}),
      // When none of the overrides are provided, Prisma applies model defaults
      // (status=PENDING_REVIEW, priceInCredits=10, maxUnlocks=3).
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

export const listActiveLeads = async ({
  vendorUserId,
  search,
  destination,
  departureCity,
  travelFrom,
  travelTo,
  budgetMin,
  budgetMax,
  priceMin,
  priceMax,
  createdFrom,
  createdTo,
  excludeUnlocked,
  sortBy,
  order,
  take,
  skip,
}) => {
  // Global marketplace = ACTIVE leads NOT tied to a specific vendor. Direct
  // leads (targetVendorId set) are surfaced via /vendor/leads/direct only.
  const where = { status: 'ACTIVE', targetVendorId: null };

  // ---- Text filters (top-level, indexed, case-insensitive) ----
  if (destination) {
    where.destination = { contains: destination, mode: 'insensitive' };
  }
  if (departureCity) {
    where.departureCity = { contains: departureCity, mode: 'insensitive' };
  }
  if (search) {
    where.OR = [
      { destination: { contains: search, mode: 'insensitive' } },
      { departureCity: { contains: search, mode: 'insensitive' } },
      // email/phone search intentionally omitted here — they're masked for
      // vendors anyway, so searching by them would leak existence info.
    ];
  }

  // ---- Range filters ----
  const range = (min, max) => {
    const r = {};
    if (min !== undefined) r.gte = min;
    if (max !== undefined) r.lte = max;
    return Object.keys(r).length ? r : undefined;
  };

  const budgetRange = range(budgetMin, budgetMax);
  if (budgetRange) where.budget = budgetRange;

  const priceRange = range(priceMin, priceMax);
  if (priceRange) where.priceInCredits = priceRange;

  const createdRange = range(createdFrom, createdTo);
  if (createdRange) where.createdAt = createdRange;

  const travelRange = range(travelFrom, travelTo);
  if (travelRange) where.travelDate = travelRange;

  // ---- Hide leads this vendor already unlocked ----
  // Using a NOT-IN against the LeadAssignment relation — Prisma resolves this
  // as a single SQL with a NOT EXISTS subquery. Indexed on (leadId, vendorUserId).
  if (excludeUnlocked && vendorUserId) {
    where.assignments = { none: { vendorUserId } };
  }

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { [sortBy ?? 'createdAt']: order ?? 'desc' },
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
  departureCity: true,
  travelDate: true,
  budget: true,
  requirements: true,
  status: true,
  priceInCredits: true,
  maxUnlocks: true,
  unlockCount: true,
  packageId: true, // lets the customer see "Inquiry for {package.title}"
  package: {
    select: { id: true, title: true, slug: true, destination: true, mainImageUrl: true },
  },
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
