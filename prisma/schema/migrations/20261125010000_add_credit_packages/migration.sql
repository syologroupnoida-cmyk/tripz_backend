CREATE TABLE "credit_packages" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "credits" INTEGER NOT NULL,
  "salePriceInPaise" INTEGER NOT NULL,
  "offerPriceInPaise" INTEGER NOT NULL,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_packages_isActive_displayOrder_idx" ON "credit_packages"("isActive", "displayOrder");
CREATE INDEX "credit_packages_deletedAt_idx" ON "credit_packages"("deletedAt");
