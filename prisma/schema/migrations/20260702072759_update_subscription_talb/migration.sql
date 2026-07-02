/*
  Warnings:

  - You are about to drop the column `priceInPaise` on the `subscription_plans` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[slug]` on the table `subscription_plans` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `offerPriceInPaise` to the `subscription_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `salePriceInPaise` to the `subscription_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `subscription_plans` table without a default value. This is not possible if the table is not empty.
  - Made the column `description` on table `subscription_plans` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY');

-- DropIndex
DROP INDEX "subscription_plans_isActive_idx";

-- AlterTable
ALTER TABLE "subscription_plans" DROP COLUMN "priceInPaise",
ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "directLeadPriceCredits" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "displayContent" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offerPriceInPaise" INTEGER NOT NULL,
ADD COLUMN     "salePriceInPaise" INTEGER NOT NULL,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "trialDays" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "includedCredits" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_slug_key" ON "subscription_plans"("slug");

-- CreateIndex
CREATE INDEX "subscription_plans_isActive_isFeatured_idx" ON "subscription_plans"("isActive", "isFeatured");

-- CreateIndex
CREATE INDEX "subscription_plans_deletedAt_idx" ON "subscription_plans"("deletedAt");

-- CreateIndex
CREATE INDEX "subscription_plans_displayOrder_idx" ON "subscription_plans"("displayOrder");
