// =============================================================================
//   Package service — vendor-created marketplace offerings
// =============================================================================
//
// State machine:
//   DRAFT     → SUBMITTED  (vendor submit)
//   REJECTED  → SUBMITTED  (vendor edit + resubmit)
//   SUBMITTED → APPROVED   (admin approve)
//   SUBMITTED → REJECTED   (admin reject with reason)
//   APPROVED  → PAUSED     (vendor self-pause)
//   PAUSED    → APPROVED   (vendor resume — no re-review)
//   Any       → soft-deleted (vendor delete)
//
// Business rules enforced here:
//   • Slug is generated from title on create (collision-safe).
//   • Editing an APPROVED package keeps it live but flags hasPendingReview.
//   • SEASONAL packages need startDate/endDate (validator already enforces).
//   • Subscription-level guards (active sub, maxPackages) — Phase 2B.
// =============================================================================

import { ApiError } from '../../utils/ApiError.js';
import * as packageRepo from '../../repositories/package.repository.js';
import * as subscriptionRepo from '../../repositories/subscription.repository.js';

// -----------------------------------------------------------------------------
//   Slug helpers
// -----------------------------------------------------------------------------

const slugify = (raw) =>
  String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/**
 * Collision-safe slug. If the base is taken (including by soft-deleted rows),
 * try -2, -3, ... up to 50 attempts, then fall back to a timestamp suffix.
 */
const generateUniqueSlug = async (baseText) => {
  const base = slugify(baseText) || 'package';
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await packageRepo.getPackageBySlug(candidate);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
    if (n > 50) return `${base}-${Date.now()}`;
  }
};

// -----------------------------------------------------------------------------
//   Subscription gate — must pass before a new package can be created
// -----------------------------------------------------------------------------
/**
 * Enforces two rules at package creation time:
 *
 *   1. Vendor must have an ACTIVE subscription (with expiresAt > now).
 *      Without one → 403 NO_ACTIVE_SUBSCRIPTION.
 *   2. Vendor must be within their plan's `maxPackages` quota. `-1` means
 *      unlimited. Count includes DRAFT/SUBMITTED/APPROVED/PAUSED but NOT
 *      REJECTED or soft-deleted rows (see repo.countVendorActivePackages).
 *      Over quota → 403 PACKAGE_LIMIT_REACHED with meta so the UI can prompt
 *      an upgrade.
 *
 * Note: this only gates NEW package creation. Existing packages stay put if
 * a subscription expires (Phase 2B cron will auto-pause them after a grace
 * window).
 */
const assertCanCreatePackage = async (vendorUserId) => {
  const sub = await subscriptionRepo.findActiveSubscriptionForVendor(vendorUserId);
  const isExpired = sub && new Date(sub.expiresAt) < new Date();

  if (!sub || isExpired) {
    throw new ApiError(403, 'You need an active subscription to create packages.', {
      code: 'NO_ACTIVE_SUBSCRIPTION',
    });
  }

  const plan = sub.plan;
  if (plan.maxPackages === -1) return; // Unlimited — skip quota check.

  const currentCount = await packageRepo.countVendorActivePackages(vendorUserId);
  if (currentCount >= plan.maxPackages) {
    throw new ApiError(
      403,
      `You have reached your plan's package limit (${plan.maxPackages}). Upgrade your plan to create more packages.`,
      {
        code: 'PACKAGE_LIMIT_REACHED',
        currentPackages: currentCount,
        maxPackages: plan.maxPackages,
        planName: plan.name,
      },
    );
  }
};

// -----------------------------------------------------------------------------
//   Vendor — create package (DRAFT by default; ?draft=false → straight SUBMITTED)
// -----------------------------------------------------------------------------
/**
 * Creates a new package for the vendor.
 *
 * `asDraft` (default true) controls the initial state:
 *   • true  → status DRAFT; vendor can iterate freely; separate /submit call
 *             is needed to move to admin review.
 *   • false → status SUBMITTED; `submittedAt` stamped immediately. Vendor
 *             cannot edit until admin approves or rejects.
 *
 * The subscription + quota gate runs in both cases — a submitted package
 * still consumes a maxPackages slot.
 */
export const createDraftPackage = async ({ vendorUserId, data, asDraft = true }) => {
  // Subscription + quota gate BEFORE any writes.
  await assertCanCreatePackage(vendorUserId);

  const slug = await generateUniqueSlug(data.title);
  const now = new Date();

  const pkg = await packageRepo.createPackage({
    vendorUserId,
    slug,
    status: asDraft ? 'DRAFT' : 'SUBMITTED',
    submittedAt: asDraft ? null : now,
    hasPendingReview: false,
    ...data,
  });

  return {
    package: pkg,
    message: asDraft
      ? 'Draft package created.'
      : 'Package created and submitted for admin review.',
  };
};

// -----------------------------------------------------------------------------
//   Vendor — update package
// -----------------------------------------------------------------------------
/**
 * Updates fields on a vendor's package. Allowed for DRAFT / REJECTED /
 * APPROVED / PAUSED (SUBMITTED is locked while admin reviews).
 *
 * Behaviour by state:
 *   • DRAFT / REJECTED — edits are silent; nothing else changes.
 *   • APPROVED         — edits go live BUT hasPendingReview is flagged so
 *                        admins can spot changes worth re-reviewing.
 *   • PAUSED           — same as APPROVED (paused packages are still admin-
 *                        approved content).
 *
 * Title change triggers a slug regen (fresh unique slug).
 */
export const updatePackage = async ({ vendorUserId, packageId, data }) => {
  const existing = await packageRepo.getPackageById(packageId);
  if (!existing) throw ApiError.notFound('Package not found.');
  if (existing.vendorUserId !== vendorUserId) {
    throw new ApiError(403, 'You can only edit your own packages.');
  }
  if (existing.status === 'SUBMITTED') {
    throw new ApiError(
      409,
      'Cannot edit a package that is under admin review. Wait for the decision, then edit.',
      { code: 'PACKAGE_UNDER_REVIEW' },
    );
  }

  const patch = { ...data };

  // Slug regen on title change (excluding the current row so re-saving the
  // same title doesn't collide with itself).
  if (data.title && data.title !== existing.title) {
    patch.slug = await generateUniqueSlug(data.title);
  }

  // Flag re-review for edits on already-approved / paused rows.
  if (existing.status === 'APPROVED' || existing.status === 'PAUSED') {
    patch.hasPendingReview = true;
  }

  const updated = await packageRepo.updatePackage(packageId, patch);
  return {
    package: updated,
    message:
      existing.status === 'APPROVED' || existing.status === 'PAUSED'
        ? 'Package updated. Changes are live and flagged for re-review.'
        : 'Package updated.',
  };
};

// -----------------------------------------------------------------------------
//   Vendor — submit for review
// -----------------------------------------------------------------------------
export const submitPackageForReview = async ({ vendorUserId, packageId }) => {
  const result = await packageRepo.submitPackage({ id: packageId, vendorUserId });

  if (!result.updated) {
    if (result.notFound) throw ApiError.notFound('Package not found.');
    throw new ApiError(
      409,
      `Cannot submit a package that is currently ${result.currentStatus}.`,
      { code: 'INVALID_TRANSITION', currentStatus: result.currentStatus },
    );
  }

  return { package: result.package, message: 'Package submitted for admin review.' };
};

// -----------------------------------------------------------------------------
//   Vendor — pause / resume (unified toggle)
// -----------------------------------------------------------------------------
/**
 * Toggle package visibility.
 *
 *   `paused: true`  → APPROVED → PAUSED  (hides from marketplace)
 *   `paused: false` → PAUSED   → APPROVED (back on marketplace, no re-review)
 *
 * The repository still exposes two atomic methods with their own guards so
 * we don't need a "current status" lookup here — attempting to pause a row
 * that isn't APPROVED (or resume one that isn't PAUSED) fails with a
 * specific INVALID_TRANSITION error.
 */
export const togglePausePackageAsVendor = async ({ vendorUserId, packageId, paused }) => {
  const result = paused
    ? await packageRepo.pausePackage({ id: packageId, vendorUserId })
    : await packageRepo.resumePackage({ id: packageId, vendorUserId });

  if (!result.updated) {
    if (result.notFound) throw ApiError.notFound('Package not found.');
    const expected = paused ? 'APPROVED' : 'PAUSED';
    const action = paused ? 'paused' : 'resumed';
    throw new ApiError(
      409,
      `Only ${expected} packages can be ${action} (current: ${result.currentStatus}).`,
      { code: 'INVALID_TRANSITION', currentStatus: result.currentStatus },
    );
  }

  return {
    package: result.package,
    message: paused
      ? 'Package paused. It is hidden from the marketplace.'
      : 'Package resumed. It is live on the marketplace.',
  };
};

// -----------------------------------------------------------------------------
//   Vendor — delete (soft)
// -----------------------------------------------------------------------------
export const deletePackageAsVendor = async ({ vendorUserId, packageId }) => {
  const result = await packageRepo.softDeletePackage({ id: packageId, vendorUserId });

  if (!result.updated) {
    if (result.notFound) throw ApiError.notFound('Package not found.');
    if (result.alreadyDeleted) {
      throw new ApiError(409, 'Package is already deleted.', { code: 'ALREADY_DELETED' });
    }
    throw new ApiError(500, 'Failed to delete package.');
  }

  return { package: result.package, message: 'Package deleted.' };
};

// -----------------------------------------------------------------------------
//   Vendor — reads
// -----------------------------------------------------------------------------
export const listMyPackages = async (query) => {
  const { items, total } = await packageRepo.listPackagesForVendor(query);
  return { items, total, take: query.take, skip: query.skip };
};

export const getMyPackageDetail = async ({ vendorUserId, packageId }) => {
  const pkg = await packageRepo.getPackageById(packageId);
  if (!pkg) throw ApiError.notFound('Package not found.');
  if (pkg.vendorUserId !== vendorUserId) {
    throw new ApiError(403, 'You can only view your own packages.');
  }
  return pkg;
};

// -----------------------------------------------------------------------------
//   Admin — reads
// -----------------------------------------------------------------------------
export const listPackagesForAdmin = async (query) => {
  const { items, total } = await packageRepo.listPackagesForAdmin(query);
  return { items, total, take: query.take, skip: query.skip };
};

export const getPackageDetailForAdmin = async (packageId) => {
  const pkg = await packageRepo.getPackageByIdForAdmin(packageId);
  if (!pkg) throw ApiError.notFound('Package not found.');
  return pkg;
};

// -----------------------------------------------------------------------------
//   Admin — approve / reject
// -----------------------------------------------------------------------------
export const approvePackageAsAdmin = async ({ packageId, adminId }) => {
  const result = await packageRepo.approvePackage({ id: packageId, adminId });

  if (!result.updated) {
    if (result.notFound) throw ApiError.notFound('Package not found.');
    throw new ApiError(
      409,
      `Only SUBMITTED packages can be approved (current: ${result.currentStatus}).`,
      { code: 'INVALID_TRANSITION', currentStatus: result.currentStatus },
    );
  }

  console.log(`[admin-audit] APPROVE_PACKAGE pkg=${packageId} by admin=${adminId}`);

  return { package: result.package, message: 'Package approved.' };
};

export const rejectPackageAsAdmin = async ({ packageId, adminId, reason }) => {
  const result = await packageRepo.rejectPackage({ id: packageId, adminId, reason });

  if (!result.updated) {
    if (result.notFound) throw ApiError.notFound('Package not found.');
    throw new ApiError(
      409,
      `Only SUBMITTED packages can be rejected (current: ${result.currentStatus}).`,
      { code: 'INVALID_TRANSITION', currentStatus: result.currentStatus },
    );
  }

  console.log(
    `[admin-audit] REJECT_PACKAGE pkg=${packageId} by admin=${adminId} reason="${reason}"`,
  );

  return {
    package: result.package,
    message: 'Package rejected. Vendor can edit and resubmit.',
  };
};

// -----------------------------------------------------------------------------
//   Public — marketplace browse
// -----------------------------------------------------------------------------
export const listPackagesPublic = async (query) => {
  const { items, total } = await packageRepo.listPackagesPublic(query);
  return { items, total, take: query.take, skip: query.skip };
};

export const getPackageBySlugPublic = async (slug) => {
  const pkg = await packageRepo.getPackageBySlugPublic(slug);
  if (!pkg) throw ApiError.notFound('Package not found.');
  return pkg;
};
