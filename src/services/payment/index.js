import crypto from 'node:crypto';
import prisma from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import * as paymentRepo from '../../repositories/payment.repository.js';
import * as razorpay from './providers/razorpay.provider.js';

const paymentResponse = (payment) => ({
  id: payment.id,
  purpose: payment.purpose,
  referenceId: payment.referenceId,
  amountInPaise: payment.amountInPaise,
  currency: payment.currency,
  status: payment.status,
  provider: payment.provider,
  providerOrderId: payment.providerOrderId,
  keyId: razorpay.publicKeyId(),
});

export const createOrder = async ({ userId, purpose, referenceId, amountInPaise, metadata = {} }) => {
  if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
    throw ApiError.badRequest('Payment amount must be greater than zero.');
  }

  const reusable = await paymentRepo.findReusablePayment({ userId, purpose, referenceId });
  if (reusable?.providerOrderId) return paymentResponse(reusable);

  const payment = await paymentRepo.createPayment({
    userId, purpose, referenceId, amountInPaise, currency: 'INR',
    idempotencyKey: crypto.randomUUID(), metadata,
  });

  try {
    const order = await razorpay.createOrder({
      amountInPaise,
      currency: payment.currency,
      receipt: payment.id,
      notes: { paymentId: payment.id, purpose, referenceId },
    });
    const updated = await paymentRepo.updatePayment(payment.id, {
      providerOrderId: order.id,
      status: 'PENDING',
    });
    return paymentResponse(updated);
  } catch (error) {
    await paymentRepo.updatePayment(payment.id, {
      status: 'FAILED', failureMessage: error.message,
    }).catch(() => {});
    throw error;
  }
};

const fulfillCapturedPayment = async ({ paymentId, providerPaymentId }) => {
  let confirmedBookingId = null;
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw ApiError.notFound('Payment not found.');
    if (payment.status === 'CAPTURED') return payment;
    if (!['CREATED', 'PENDING'].includes(payment.status)) {
      throw new ApiError(409, `Payment cannot be captured from ${payment.status}.`);
    }

    // Checkout verification and webhook delivery may arrive together. Claim
    // this payment first so only one transaction can grant the purchase.
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['CREATED', 'PENDING'] } },
      data: {
        status: 'CAPTURED', providerPaymentId, paidAt: new Date(),
        failureCode: null, failureMessage: null,
      },
    });
    if (claimed.count !== 1) {
      return tx.payment.findUnique({ where: { id: payment.id } });
    }

    if (payment.purpose === 'PROPERTY_BOOKING') {
      const changed = await tx.propertyBooking.updateMany({
        where: { id: payment.referenceId, guestUserId: payment.userId, status: 'PENDING_PAYMENT' },
        data: { status: 'CONFIRMED', paymentStatus: 'PAID', paymentExpiresAt: null },
      });
      if (changed.count !== 1) throw new ApiError(409, 'Booking is no longer awaiting payment.');
      confirmedBookingId = payment.referenceId;
    } else if (payment.purpose === 'VENDOR_SUBSCRIPTION') {
      const meta = payment.metadata ?? {};
      const plan = await tx.subscriptionPlan.findFirst({
        where: { id: payment.referenceId, isActive: true, deletedAt: null },
      });
      if (!plan) throw ApiError.notFound('Subscription plan is no longer available.');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (plan.durationDays + Number(meta.bonusDays ?? 0)) * 86400000);

      if (meta.action === 'UPGRADE') {
        const changed = await tx.vendorSubscription.updateMany({
          where: {
            id: meta.oldSubscriptionId,
            vendorUserId: payment.userId,
            status: 'ACTIVE',
            expiresAt: { gt: now },
          },
          data: { status: 'UPGRADED' },
        });
        if (changed.count !== 1) throw new ApiError(409, 'Subscription state changed. Please start checkout again.');
      } else {
        const active = await tx.vendorSubscription.count({
          where: { vendorUserId: payment.userId, status: 'ACTIVE', expiresAt: { gt: now } },
        });
        if (active) throw new ApiError(409, 'An active subscription already exists.');
      }

      const subscription = await tx.vendorSubscription.create({
        data: {
          vendorUserId: payment.userId, planId: plan.id, startsAt: now, expiresAt,
          creditsGranted: plan.includedCredits, bonusDays: Number(meta.bonusDays ?? 0),
          paymentRef: payment.id,
        },
      });
      if (meta.action === 'UPGRADE') {
        await tx.vendorSubscription.update({
          where: { id: meta.oldSubscriptionId },
          data: { replacedBySubscriptionId: subscription.id },
        });
      }
      const wallet = await tx.wallet.upsert({
        where: { vendorUserId: payment.userId },
        create: { vendorUserId: payment.userId, balanceCredits: plan.includedCredits },
        update: { balanceCredits: { increment: plan.includedCredits } },
      });
      if (plan.includedCredits > 0) {
        await tx.walletTransaction.create({ data: {
          vendorUserId: payment.userId, type: 'CREDIT_SUBSCRIPTION_GRANT',
          amount: plan.includedCredits, balanceAfter: wallet.balanceCredits,
          referenceType: 'SUBSCRIPTION', referenceId: subscription.id,
        } });
      }
    } else if (payment.purpose === 'WALLET_TOP_UP') {
      const credits = Number(payment.metadata?.credits ?? 0);
      if (!Number.isInteger(credits) || credits <= 0) throw ApiError.badRequest('Invalid wallet credit amount.');
      const wallet = await tx.wallet.upsert({
        where: { vendorUserId: payment.userId },
        create: { vendorUserId: payment.userId, balanceCredits: credits },
        update: { balanceCredits: { increment: credits } },
      });
      await tx.walletTransaction.create({ data: {
        vendorUserId: payment.userId, type: 'CREDIT_TOP_UP', amount: credits,
        balanceAfter: wallet.balanceCredits, referenceType: 'PAYMENT', referenceId: payment.id,
      } });
    }

    return tx.payment.findUnique({ where: { id: payment.id } });
  });

  if (confirmedBookingId) {
    const [{ getBookingById }, { sendBookingCreatedNotifications }] = await Promise.all([
      import('../../repositories/propertyBooking.repository.js'),
      import('../propertyBooking/index.js'),
    ]);
    const booking = await getBookingById(confirmedBookingId);
    sendBookingCreatedNotifications(booking);
  }
  return result;
};

export const verifyCheckout = async ({ userId, orderId, providerPaymentId, signature }) => {
  const payment = await paymentRepo.getPaymentByOrderId(orderId);
  if (!payment || payment.userId !== userId) throw ApiError.notFound('Payment order not found.');
  if (!razorpay.verifyCheckoutSignature({ orderId, paymentId: providerPaymentId, signature })) {
    throw ApiError.badRequest('Invalid payment signature.', { code: 'INVALID_PAYMENT_SIGNATURE' });
  }
  return paymentResponse(await fulfillCapturedPayment({ paymentId: payment.id, providerPaymentId }));
};

export const getMyPayment = async ({ userId, paymentId }) => {
  const payment = await paymentRepo.getPaymentById(paymentId);
  if (!payment || payment.userId !== userId) throw ApiError.notFound('Payment not found.');
  return paymentResponse(payment);
};

export const refundForReference = async ({ userId, purpose, referenceId, amountInPaise, reason }) => {
  const payment = await prisma.payment.findFirst({
    where: { userId, purpose, referenceId, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment?.providerPaymentId) return null;
  const refundable = payment.amountInPaise - payment.refundedInPaise;
  const amount = Math.min(amountInPaise, refundable);
  if (amount <= 0) return null;
  const providerRefund = await razorpay.refundPayment({
    providerPaymentId: payment.providerPaymentId,
    amountInPaise: amount,
    notes: { paymentId: payment.id, reason: reason ?? 'Customer cancellation' },
  });
  return prisma.paymentRefund.create({ data: {
    paymentId: payment.id,
    providerRefundId: providerRefund.id,
    amountInPaise: amount,
    status: providerRefund.status ?? 'pending',
    reason: reason ?? null,
  } });
};

export const processWebhook = async ({ rawBody, signature, eventId }) => {
  if (!razorpay.verifyWebhookSignature({ rawBody, signature })) {
    throw ApiError.badRequest('Invalid webhook signature.');
  }
  const payload = JSON.parse(rawBody.toString('utf8'));
  const stableEventId = eventId || crypto.createHash('sha256').update(rawBody).digest('hex');
  const existing = await prisma.paymentWebhookEvent.findUnique({ where: { providerEventId: stableEventId } });
  if (existing?.processedAt) return;
  await prisma.paymentWebhookEvent.upsert({
    where: { providerEventId: stableEventId },
    create: { provider: 'RAZORPAY', providerEventId: stableEventId, eventType: payload.event, payload },
    update: {},
  });
  try {
    if (payload.event === 'payment.captured') {
      const entity = payload.payload?.payment?.entity;
      const payment = await paymentRepo.getPaymentByOrderId(entity?.order_id);
      if (payment) await fulfillCapturedPayment({ paymentId: payment.id, providerPaymentId: entity.id });
    } else if (payload.event === 'payment.failed') {
      const entity = payload.payload?.payment?.entity;
      const payment = await paymentRepo.getPaymentByOrderId(entity?.order_id);
      if (payment && payment.status !== 'CAPTURED') {
        await paymentRepo.updatePayment(payment.id, {
          status: 'FAILED', providerPaymentId: entity.id,
          failureCode: entity.error_code, failureMessage: entity.error_description,
        });
      }
    } else if (payload.event === 'refund.processed') {
      const entity = payload.payload?.refund?.entity;
      const payment = await paymentRepo.getPaymentByProviderPaymentId(entity?.payment_id);
      if (payment) {
        const refund = await prisma.paymentRefund.findFirst({
          where: { providerRefundId: entity.id },
        });
        if (refund && refund.status !== 'processed') {
          const refundedInPaise = Math.min(payment.amountInPaise, payment.refundedInPaise + refund.amountInPaise);
          const fullyRefunded = refundedInPaise === payment.amountInPaise;
          await prisma.$transaction([
            prisma.paymentRefund.update({ where: { id: refund.id }, data: { status: 'processed' } }),
            prisma.payment.update({
              where: { id: payment.id },
              data: { refundedInPaise, status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
            }),
            ...(payment.purpose === 'PROPERTY_BOOKING' ? [prisma.propertyBooking.update({
              where: { id: payment.referenceId },
              data: { paymentStatus: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
            })] : []),
          ]);
        }
      }
    }
    await prisma.paymentWebhookEvent.update({
      where: { providerEventId: stableEventId }, data: { processedAt: new Date() },
    });
  } catch (error) {
    await prisma.paymentWebhookEvent.update({
      where: { providerEventId: stableEventId }, data: { errorMessage: error.message },
    });
    throw error;
  }
};
