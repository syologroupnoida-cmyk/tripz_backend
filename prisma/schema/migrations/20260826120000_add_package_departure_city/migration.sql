-- Add the structured journey origin used by package create/update and listing filters.
ALTER TABLE "packages" ADD COLUMN "departureCity" TEXT;

CREATE INDEX "packages_departureCity_idx" ON "packages"("departureCity");
