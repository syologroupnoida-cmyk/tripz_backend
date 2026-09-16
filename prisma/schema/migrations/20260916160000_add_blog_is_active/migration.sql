ALTER TABLE "blogs"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "blogs_isActive_createdAt_idx" ON "blogs"("isActive", "createdAt");
