-- CreateEnum
CREATE TYPE "TravelGuideType" AS ENUM ('NATIONAL', 'INTERNATIONAL');

-- AlterTable: the default safely backfills existing travel guides as NATIONAL.
ALTER TABLE "travel_guides"
ADD COLUMN "travelGuideType" "TravelGuideType" NOT NULL DEFAULT 'NATIONAL';

-- CreateIndex
CREATE INDEX "travel_guides_travelGuideType_idx" ON "travel_guides"("travelGuideType");
