-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "departureCity" TEXT,
ADD COLUMN     "travelDate" TIMESTAMP(3);

-- Backfill departureCity from existing requirements JSONB (where present + non-empty).
UPDATE "leads"
SET "departureCity" = NULLIF(TRIM("requirements"->>'departureCity'), '')
WHERE "requirements" ? 'departureCity'
  AND TRIM(COALESCE("requirements"->>'departureCity', '')) <> '';

-- Backfill travelDate from existing requirements JSONB.
-- Only converts values that parse cleanly to a timestamp; everything else stays NULL.
-- Wrapped in DO block so a single bad row doesn't abort the migration.
DO $$
DECLARE
  lead_row RECORD;
  parsed TIMESTAMP;
BEGIN
  FOR lead_row IN
    SELECT "id", "requirements"->>'travelDate' AS raw
    FROM "leads"
    WHERE "requirements" ? 'travelDate'
      AND TRIM(COALESCE("requirements"->>'travelDate', '')) <> ''
  LOOP
    BEGIN
      parsed := lead_row.raw::TIMESTAMP;
      UPDATE "leads" SET "travelDate" = parsed WHERE "id" = lead_row.id;
    EXCEPTION WHEN OTHERS THEN
      -- Unparseable date string — leave travelDate NULL for this row.
      NULL;
    END;
  END LOOP;
END $$;

-- CreateIndex
CREATE INDEX "leads_departureCity_idx" ON "leads"("departureCity");

-- CreateIndex
CREATE INDEX "leads_travelDate_idx" ON "leads"("travelDate");
