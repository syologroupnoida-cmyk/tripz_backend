-- CreateEnum
CREATE TYPE "PackageRegion" AS ENUM ('NATIONAL', 'INTERNATIONAL');

-- AlterEnum
ALTER TYPE "PackageType" ADD VALUE 'HOLIDAY';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "packageId" TEXT;

-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "packageRegion" "PackageRegion" NOT NULL DEFAULT 'NATIONAL';

-- CreateIndex
CREATE INDEX "leads_packageId_idx" ON "leads"("packageId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
