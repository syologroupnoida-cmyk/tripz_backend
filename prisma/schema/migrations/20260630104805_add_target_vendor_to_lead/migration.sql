-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "targetVendorId" TEXT;

-- CreateIndex
CREATE INDEX "leads_targetVendorId_status_idx" ON "leads"("targetVendorId", "status");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_targetVendorId_fkey" FOREIGN KEY ("targetVendorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
