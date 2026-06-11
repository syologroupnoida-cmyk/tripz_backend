/*
  Warnings:

  - You are about to drop the column `businessAddress` on the `vendor_kyc` table. All the data in the column will be lost.
  - You are about to drop the column `gstNumber` on the `vendor_kyc` table. All the data in the column will be lost.
  - You are about to drop the column `panNumber` on the `vendor_kyc` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[googleId]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `officeAddress` to the `vendor_kyc` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE', 'HYBRID');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PVT_LTD', 'PUBLIC_LTD', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferralSource" AS ENUM ('REFERENCE', 'GOOGLE', 'SOCIAL_MEDIA', 'ADVERTISEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('PAN', 'GSTIN', 'CIN', 'AADHAR', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('PENDING_REVIEW', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('DEBIT_LEAD_UNLOCK', 'CREDIT_TOP_UP', 'CREDIT_REFUND', 'CREDIT_ADMIN_ADJUSTMENT', 'DEBIT_ADMIN_ADJUSTMENT');

-- AlterEnum
ALTER TYPE "EmailOtpPurpose" ADD VALUE 'AADHAAR_VERIFICATION';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "authProvider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "password" DROP NOT NULL,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vendor_kyc" DROP COLUMN "businessAddress",
DROP COLUMN "gstNumber",
DROP COLUMN "panNumber",
ADD COLUMN     "agreedTerms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "companyLogoUrl" TEXT,
ADD COLUMN     "companySinceYears" INTEGER,
ADD COLUMN     "companyType" "CompanyType",
ADD COLUMN     "dailyLeadRequirement" INTEGER,
ADD COLUMN     "declaredTrue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "destinations" TEXT[],
ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "marketplaceWorked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "officeAddress" TEXT NOT NULL,
ADD COLUMN     "officeCity" TEXT,
ADD COLUMN     "officeState" TEXT,
ADD COLUMN     "otherSource" TEXT,
ADD COLUMN     "referralSource" "ReferralSource",
ADD COLUMN     "services" TEXT[],
ADD COLUMN     "teamSize" INTEGER,
ADD COLUMN     "websiteUrl" TEXT;

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "budget" INTEGER,
    "customerUserId" TEXT,
    "requirements" JSONB NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "priceInCredits" INTEGER NOT NULL DEFAULT 10,
    "maxUnlocks" INTEGER NOT NULL DEFAULT 3,
    "unlockCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_assignments" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "priceInCreditsPaid" INTEGER NOT NULL,
    "walletTransactionId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_kyc_documents" (
    "id" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "type" "KycDocumentType" NOT NULL,
    "documentNumber" TEXT,
    "documentUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByAdminId" TEXT,
    "notes" TEXT,
    "thirdPartyVerified" BOOLEAN NOT NULL DEFAULT false,
    "thirdPartyProvider" TEXT,
    "thirdPartyVerifiedAt" TIMESTAMP(3),
    "thirdPartyResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "vendorUserId" TEXT NOT NULL,
    "balanceCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("vendorUserId")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_destination_idx" ON "leads"("destination");

-- CreateIndex
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lead_assignments_walletTransactionId_key" ON "lead_assignments"("walletTransactionId");

-- CreateIndex
CREATE INDEX "lead_assignments_vendorUserId_idx" ON "lead_assignments"("vendorUserId");

-- CreateIndex
CREATE INDEX "lead_assignments_leadId_idx" ON "lead_assignments"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "lead_assignments_leadId_vendorUserId_key" ON "lead_assignments"("leadId", "vendorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_kyc_documents_vendorUserId_type_key" ON "vendor_kyc_documents"("vendorUserId", "type");

-- CreateIndex
CREATE INDEX "wallet_transactions_vendorUserId_createdAt_idx" ON "wallet_transactions"("vendorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_transactions_type_idx" ON "wallet_transactions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "vendor_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "wallet_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_kyc_documents" ADD CONSTRAINT "vendor_kyc_documents_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "vendor_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "vendor_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "wallets"("vendorUserId") ON DELETE CASCADE ON UPDATE CASCADE;
