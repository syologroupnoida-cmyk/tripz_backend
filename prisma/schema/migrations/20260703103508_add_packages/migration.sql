-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAUSED');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('FAMILY', 'COUPLE', 'HONEYMOON', 'SOLO', 'GROUP', 'ADVENTURE', 'RELIGIOUS', 'BEACH', 'HILL_STATION', 'WILDLIFE', 'CULTURAL', 'CORPORATE', 'OTHER');

-- CreateEnum
CREATE TYPE "PackageValidityType" AS ENUM ('EVERGREEN', 'SEASONAL');

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "route" TEXT,
    "duration" TEXT,
    "overview" TEXT NOT NULL,
    "otherDetails" TEXT,
    "cancellationPolicy" TEXT,
    "packageType" "PackageType" NOT NULL,
    "validityType" "PackageValidityType" NOT NULL DEFAULT 'EVERGREEN',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "priceInPaise" INTEGER NOT NULL,
    "oldPriceInPaise" INTEGER,
    "discountPercent" INTEGER,
    "hotelCategory" TEXT,
    "transfers" TEXT,
    "meals" TEXT,
    "sightseeing" TEXT,
    "mainImageUrl" TEXT NOT NULL,
    "galleryImageUrls" TEXT[],
    "highlights" TEXT[],
    "inclusions" TEXT[],
    "exclusions" TEXT[],
    "itinerary" JSONB NOT NULL,
    "offerTitle" TEXT,
    "offerDescription" TEXT,
    "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT',
    "hasPendingReview" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "rejectionReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "packages_slug_key" ON "packages"("slug");

-- CreateIndex
CREATE INDEX "packages_status_validityType_idx" ON "packages"("status", "validityType");

-- CreateIndex
CREATE INDEX "packages_destination_idx" ON "packages"("destination");

-- CreateIndex
CREATE INDEX "packages_packageType_idx" ON "packages"("packageType");

-- CreateIndex
CREATE INDEX "packages_vendorUserId_status_idx" ON "packages"("vendorUserId", "status");

-- CreateIndex
CREATE INDEX "packages_validityType_endDate_idx" ON "packages"("validityType", "endDate");

-- CreateIndex
CREATE INDEX "packages_deletedAt_idx" ON "packages"("deletedAt");

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "vendor_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
