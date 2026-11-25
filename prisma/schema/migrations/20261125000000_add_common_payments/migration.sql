ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_PAYMENT' BEFORE 'CONFIRMED';

CREATE TYPE "PaymentPurpose" AS ENUM ('PROPERTY_BOOKING', 'VENDOR_SUBSCRIPTION', 'WALLET_TOP_UP');
CREATE TYPE "PaymentState" AS ENUM ('CREATED', 'PENDING', 'CAPTURED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

ALTER TABLE "property_bookings" ADD COLUMN "paymentExpiresAt" TIMESTAMP(3);
ALTER TABLE "property_bookings" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

CREATE TABLE "payments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" "PaymentPurpose" NOT NULL,
  "referenceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'RAZORPAY',
  "providerOrderId" TEXT,
  "providerPaymentId" TEXT,
  "amountInPaise" INTEGER NOT NULL,
  "refundedInPaise" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "PaymentState" NOT NULL DEFAULT 'CREATED',
  "idempotencyKey" TEXT NOT NULL,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "metadata" JSONB,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_refunds" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "providerRefundId" TEXT,
  "amountInPaise" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_providerOrderId_key" ON "payments"("providerOrderId");
CREATE UNIQUE INDEX "payments_providerPaymentId_key" ON "payments"("providerPaymentId");
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");
CREATE INDEX "payments_userId_createdAt_idx" ON "payments"("userId", "createdAt");
CREATE INDEX "payments_purpose_referenceId_idx" ON "payments"("purpose", "referenceId");
CREATE UNIQUE INDEX "payment_refunds_providerRefundId_key" ON "payment_refunds"("providerRefundId");
CREATE INDEX "payment_refunds_paymentId_idx" ON "payment_refunds"("paymentId");
CREATE UNIQUE INDEX "payment_webhook_events_providerEventId_key" ON "payment_webhook_events"("providerEventId");
CREATE INDEX "payment_webhook_events_provider_eventType_idx" ON "payment_webhook_events"("provider", "eventType");

ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
