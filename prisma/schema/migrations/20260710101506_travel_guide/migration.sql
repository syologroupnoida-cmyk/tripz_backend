-- CreateTable
CREATE TABLE "travel_guides" (
    "id" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "continent" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bestTimeToVisit" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "budget" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "weather" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "visaRequired" BOOLEAN NOT NULL,
    "transportation" TEXT NOT NULL,
    "accommodation" TEXT NOT NULL,
    "cuisine" TEXT NOT NULL,
    "safetyRating" DOUBLE PRECISION NOT NULL,
    "mainImage" TEXT NOT NULL,
    "galleryImages" TEXT[],
    "highlights" TEXT[],
    "activities" TEXT[],
    "tips" TEXT[],
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_guides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "travel_guides_slug_key" ON "travel_guides"("slug");

-- CreateIndex
CREATE INDEX "travel_guides_vendorUserId_idx" ON "travel_guides"("vendorUserId");

-- CreateIndex
CREATE INDEX "travel_guides_country_idx" ON "travel_guides"("country");

-- CreateIndex
CREATE INDEX "travel_guides_continent_idx" ON "travel_guides"("continent");

-- CreateIndex
CREATE INDEX "travel_guides_category_idx" ON "travel_guides"("category");

-- CreateIndex
CREATE INDEX "travel_guides_deletedAt_idx" ON "travel_guides"("deletedAt");

-- AddForeignKey
ALTER TABLE "travel_guides" ADD CONSTRAINT "travel_guides_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "vendor_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
