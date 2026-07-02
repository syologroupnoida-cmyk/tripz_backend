import prisma from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

const UNLOCKED_LEAD_SELECT = {
  id: true,
  destination: true,
  departureCity: true,
  travelDate: true,
  email: true,
  phone: true,
  budget: true,
  requirements: true,
  status: true,
  priceInCredits: true,
  maxUnlocks: true,
  unlockCount: true,
  createdAt: true,
};

/**
 * Atomically unlocks a lead for a vendor. Within a single Prisma transaction:
 *
 *   1. Verifies the lead is ACTIVE and not yet held by this vendor.
 *   2. CAS-reserves an unlock slot via updateMany(unlockCount < maxUnlocks).
 *   3. CAS-debits the wallet via updateMany(balanceCredits >= price).
 *   4. Writes a DEBIT_LEAD_UNLOCK ledger row with the post-debit snapshot.
 *   5. Creates the LeadAssignment row pointing at that ledger row.
 *   6. Flips lead.status -> EXHAUSTED if we just consumed the last slot.
 *
 * Any thrown ApiError aborts the transaction - Prisma rolls everything back,
 * so the slot reservation and debit can never desync.
 *
 * The two CAS updateMany() calls are what make this race-safe across
 * concurrent unlock requests: if two vendors race for the last slot, exactly
 * one updateMany returns { count: 1 }, the other returns { count: 0 } and
 * throws LEAD_EXHAUSTED.
 */
export const unlockLeadAtomically = async ({ leadId, vendorUserId }) => {
  return prisma.$transaction(async (tx) => {
    // 1a. Load lead state.
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        status: true,
        priceInCredits: true,
        maxUnlocks: true,
        unlockCount: true,
        targetVendorId: true,
      },
    });
    if (!lead) throw ApiError.notFound('Lead not found.');
    if (lead.status !== 'ACTIVE') {
      throw new ApiError(409, 'This lead is no longer available.', {
        code: 'LEAD_NOT_ACTIVE',
        status: lead.status,
      });
    }

    // Direct lead guard — only the targeted vendor may unlock. Prevents a
    // vendor from sniffing a direct lead's id and trying to claim it.
    if (lead.targetVendorId && lead.targetVendorId !== vendorUserId) {
      throw new ApiError(
        403,
        'This lead is reserved for another vendor.',
        { code: 'LEAD_NOT_FOR_THIS_VENDOR' },
      );
    }

    // 1b. Idempotency: already unlocked by this vendor?
    const existing = await tx.leadAssignment.findUnique({
      where: { leadId_vendorUserId: { leadId, vendorUserId } },
      select: { id: true },
    });
    if (existing) {
      throw ApiError.conflict('You have already unlocked this lead.', {
        code: 'ALREADY_UNLOCKED',
      });
    }

    // 2. CAS-reserve a slot.
    const reserved = await tx.lead.updateMany({
      where: {
        id: leadId,
        status: 'ACTIVE',
        unlockCount: { lt: lead.maxUnlocks },
      },
      data: { unlockCount: { increment: 1 } },
    });
    if (reserved.count === 0) {
      throw new ApiError(409, 'This lead has just been fully claimed.', {
        code: 'LEAD_EXHAUSTED',
      });
    }

    // 3. CAS-debit the wallet.
    const debited = await tx.wallet.updateMany({
      where: {
        vendorUserId,
        balanceCredits: { gte: lead.priceInCredits },
      },
      data: { balanceCredits: { decrement: lead.priceInCredits } },
    });
    if (debited.count === 0) {
      throw new ApiError(402, 'Insufficient credits in your wallet.', {
        code: 'INSUFFICIENT_CREDITS',
        required: lead.priceInCredits,
      });
    }

    // 4. Snapshot post-debit balance for the ledger.
    const walletAfter = await tx.wallet.findUnique({
      where: { vendorUserId },
      select: { balanceCredits: true },
    });

    // 5. Write ledger row first so the assignment can FK to it.
    const ledgerRow = await tx.walletTransaction.create({
      data: {
        vendorUserId,
        type: 'DEBIT_LEAD_UNLOCK',
        amount: lead.priceInCredits,
        balanceAfter: walletAfter.balanceCredits,
        referenceType: 'LEAD_ASSIGNMENT',
        referenceId: leadId, // temporary; updated to assignmentId below
      },
      select: { id: true, balanceAfter: true, createdAt: true },
    });

    // 6. Create the assignment row.
    const assignment = await tx.leadAssignment.create({
      data: {
        leadId,
        vendorUserId,
        priceInCreditsPaid: lead.priceInCredits,
        walletTransactionId: ledgerRow.id,
      },
      include: { lead: { select: UNLOCKED_LEAD_SELECT } },
    });

    // 7. Backfill the ledger.referenceId to the assignment id for cleaner audit.
    await tx.walletTransaction.update({
      where: { id: ledgerRow.id },
      data: { referenceId: assignment.id },
    });

    // 8. If we just consumed the last slot, mark the lead EXHAUSTED so it
    //    drops off the marketplace feed immediately.
    if (lead.unlockCount + 1 >= lead.maxUnlocks) {
      await tx.lead.update({
        where: { id: leadId },
        data: { status: 'EXHAUSTED' },
      });
      assignment.lead.status = 'EXHAUSTED';
      assignment.lead.unlockCount = lead.maxUnlocks;
    } else {
      assignment.lead.unlockCount = lead.unlockCount + 1;
    }

    return {
      assignment,
      walletBalanceAfter: walletAfter.balanceCredits,
    };
  });
};
