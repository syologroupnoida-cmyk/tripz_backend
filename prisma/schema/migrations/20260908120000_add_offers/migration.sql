CREATE TYPE "OfferDiscountType" AS ENUM ('PERCENTAGE', 'FLAT', 'FREEBIE', 'CASHBACK', 'CREDIT', 'STARTING_PRICE', 'SPECIAL_PRICE', 'TRAVEL_CREDIT');
CREATE TYPE "OfferApplicableTo" AS ENUM ('PACKAGE', 'PROPERTY', 'BOTH');
CREATE TYPE "OfferCustomerType" AS ENUM ('ALL', 'NEW', 'EXISTING');
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED');
CREATE TYPE "OfferRedemptionStatus" AS ENUM ('REDEEMED', 'CANCELLED');

ALTER TABLE "property_bookings"
ADD COLUMN "appliedCouponCode" TEXT,
ADD COLUMN "appliedOfferId" TEXT,
ADD COLUMN "discountAmountInPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "subtotalAmountInPaise" INTEGER NOT NULL DEFAULT 0;

-- Preserve the original total as the pre-discount subtotal for existing bookings.
UPDATE "property_bookings"
SET "subtotalAmountInPaise" = "totalAmountInPaise";

CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "couponCode" TEXT NOT NULL,
    "description" TEXT,
    "bannerText" TEXT,
    "termsAndConditions" TEXT,
    "discountType" "OfferDiscountType" NOT NULL,
    "discountValue" INTEGER,
    "maxDiscountInPaise" INTEGER,
    "benefitText" TEXT,
    "applicableTo" "OfferApplicableTo" NOT NULL,
    "customerType" "OfferCustomerType" NOT NULL DEFAULT 'ALL',
    "customerSegment" TEXT,
    "eligibilityText" TEXT,
    "minimumBookingInPaise" INTEGER,
    "minimumStayNights" INTEGER,
    "minimumGuests" INTEGER,
    "advanceBookingDays" INTEGER,
    "destinations" TEXT[],
    "packageTypes" "PackageType"[],
    "propertyTypes" "PropertyType"[],
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "perCustomerLimit" INTEGER NOT NULL DEFAULT 1,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "isStackable" BOOLEAN NOT NULL DEFAULT false,
    "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByAdminId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offer_package_targets" (
    "offerId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    CONSTRAINT "offer_package_targets_pkey" PRIMARY KEY ("offerId", "packageId")
);

CREATE TABLE "offer_property_targets" (
    "offerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    CONSTRAINT "offer_property_targets_pkey" PRIMARY KEY ("offerId", "propertyId")
);

CREATE TABLE "offer_customer_usages" (
    "offerId" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offer_customer_usages_pkey" PRIMARY KEY ("offerId", "customerUserId")
);

CREATE TABLE "offer_redemptions" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "propertyBookingId" TEXT NOT NULL,
    "originalAmountInPaise" INTEGER NOT NULL,
    "discountAmountInPaise" INTEGER NOT NULL,
    "finalAmountInPaise" INTEGER NOT NULL,
    "status" "OfferRedemptionStatus" NOT NULL DEFAULT 'REDEEMED',
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "offer_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offers_couponCode_key" ON "offers"("couponCode");
CREATE INDEX "offers_status_validFrom_validTo_idx" ON "offers"("status", "validFrom", "validTo");
CREATE INDEX "offers_applicableTo_idx" ON "offers"("applicableTo");
CREATE INDEX "offers_deletedAt_idx" ON "offers"("deletedAt");
CREATE INDEX "offer_package_targets_packageId_idx" ON "offer_package_targets"("packageId");
CREATE INDEX "offer_property_targets_propertyId_idx" ON "offer_property_targets"("propertyId");
CREATE INDEX "offer_customer_usages_customerUserId_idx" ON "offer_customer_usages"("customerUserId");
CREATE UNIQUE INDEX "offer_redemptions_propertyBookingId_key" ON "offer_redemptions"("propertyBookingId");
CREATE INDEX "offer_redemptions_offerId_status_idx" ON "offer_redemptions"("offerId", "status");
CREATE INDEX "offer_redemptions_customerUserId_status_idx" ON "offer_redemptions"("customerUserId", "status");
CREATE INDEX "property_bookings_appliedOfferId_idx" ON "property_bookings"("appliedOfferId");

ALTER TABLE "offer_package_targets" ADD CONSTRAINT "offer_package_targets_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_package_targets" ADD CONSTRAINT "offer_package_targets_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_property_targets" ADD CONSTRAINT "offer_property_targets_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_property_targets" ADD CONSTRAINT "offer_property_targets_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_customer_usages" ADD CONSTRAINT "offer_customer_usages_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_propertyBookingId_fkey" FOREIGN KEY ("propertyBookingId") REFERENCES "property_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_bookings" ADD CONSTRAINT "property_bookings_appliedOfferId_fkey" FOREIGN KEY ("appliedOfferId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
