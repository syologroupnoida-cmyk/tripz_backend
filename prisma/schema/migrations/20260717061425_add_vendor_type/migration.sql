-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('TRAVEL_AGENT', 'PROPERTY_OWNER');

-- AlterTable
ALTER TABLE "vendor_profiles" ADD COLUMN     "vendorType" "VendorType" NOT NULL DEFAULT 'TRAVEL_AGENT';

-- CreateIndex
CREATE INDEX "vendor_profiles_vendorType_idx" ON "vendor_profiles"("vendorType");
