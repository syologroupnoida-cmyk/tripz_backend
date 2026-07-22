-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('HOTEL', 'VILLA', 'HOMESTAY', 'STUDIO', 'RESORT', 'GUEST_HOUSE');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAUSED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID', 'ON_HOLD');

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "fullDescription" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "address" TEXT NOT NULL,
    "landmark" TEXT,
    "pincode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "mainImage" TEXT NOT NULL,
    "galleryImages" TEXT[],
    "amenities" TEXT[],
    "houseRules" TEXT[],
    "nearbyPlaces" TEXT[],
    "highlights" TEXT[],
    "starRating" INTEGER,
    "totalBedrooms" INTEGER,
    "totalBathrooms" INTEGER,
    "hostLivesOnsite" BOOLEAN NOT NULL DEFAULT false,
    "checkInTime" TEXT NOT NULL DEFAULT '14:00',
    "checkOutTime" TEXT NOT NULL DEFAULT '11:00',
    "minStayNights" INTEGER NOT NULL DEFAULT 1,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "cancellationPolicy" JSONB,
    "status" "PropertyStatus" NOT NULL DEFAULT 'DRAFT',
    "hasPendingReview" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "reviewedByAdminId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_rooms" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "pricePerNightInPaise" INTEGER NOT NULL,
    "extraGuestFeeInPaise" INTEGER,
    "maxGuests" INTEGER NOT NULL DEFAULT 2,
    "totalUnits" INTEGER NOT NULL DEFAULT 1,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "bedType" TEXT,
    "roomSizeSqft" INTEGER,
    "amenities" TEXT[],
    "images" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_bookings" (
    "id" TEXT NOT NULL,
    "guestUserId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "numGuests" INTEGER NOT NULL DEFAULT 1,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "unitsBooked" INTEGER NOT NULL DEFAULT 1,
    "pricePerNightInPaise" INTEGER NOT NULL,
    "totalAmountInPaise" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancellationReason" TEXT,
    "commissionInPaise" INTEGER,
    "payoutAmountInPaise" INTEGER,
    "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "payoutReference" TEXT,
    "payoutAt" TIMESTAMP(3),
    "payoutNotes" TEXT,
    "specialRequests" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "properties_slug_key" ON "properties"("slug");

-- CreateIndex
CREATE INDEX "properties_ownerUserId_idx" ON "properties"("ownerUserId");

-- CreateIndex
CREATE INDEX "properties_status_idx" ON "properties"("status");

-- CreateIndex
CREATE INDEX "properties_propertyType_idx" ON "properties"("propertyType");

-- CreateIndex
CREATE INDEX "properties_city_idx" ON "properties"("city");

-- CreateIndex
CREATE INDEX "properties_deletedAt_idx" ON "properties"("deletedAt");

-- CreateIndex
CREATE INDEX "properties_slug_idx" ON "properties"("slug");

-- CreateIndex
CREATE INDEX "property_rooms_propertyId_idx" ON "property_rooms"("propertyId");

-- CreateIndex
CREATE INDEX "property_rooms_isActive_idx" ON "property_rooms"("isActive");

-- CreateIndex
CREATE INDEX "property_bookings_roomId_checkIn_checkOut_status_idx" ON "property_bookings"("roomId", "checkIn", "checkOut", "status");

-- CreateIndex
CREATE INDEX "property_bookings_guestUserId_idx" ON "property_bookings"("guestUserId");

-- CreateIndex
CREATE INDEX "property_bookings_propertyId_idx" ON "property_bookings"("propertyId");

-- CreateIndex
CREATE INDEX "property_bookings_status_idx" ON "property_bookings"("status");

-- CreateIndex
CREATE INDEX "property_bookings_payoutStatus_idx" ON "property_bookings"("payoutStatus");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "vendor_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_rooms" ADD CONSTRAINT "property_rooms_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_bookings" ADD CONSTRAINT "property_bookings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_bookings" ADD CONSTRAINT "property_bookings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "property_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
