CREATE TABLE "business_profiles" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "keyword" TEXT,
    "location" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "category" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "emails" TEXT[],
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "googleMapsUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "importedByAdminId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_profiles_sourceKey_key" ON "business_profiles"("sourceKey");
CREATE INDEX "business_profiles_isActive_companyName_idx" ON "business_profiles"("isActive", "companyName");
CREATE INDEX "business_profiles_location_idx" ON "business_profiles"("location");
CREATE INDEX "business_profiles_city_idx" ON "business_profiles"("city");
CREATE INDEX "business_profiles_state_idx" ON "business_profiles"("state");
CREATE INDEX "business_profiles_category_idx" ON "business_profiles"("category");
CREATE INDEX "business_profiles_rating_idx" ON "business_profiles"("rating");
CREATE INDEX "business_profiles_deletedAt_idx" ON "business_profiles"("deletedAt");
