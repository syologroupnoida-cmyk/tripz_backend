-- CreateEnum
CREATE TYPE "StoryType" AS ENUM ('FOUNDER_STORY', 'CUSTOMER_STORY', 'VENDOR_STORY', 'JOURNEY', 'INSPIRATION', 'SUCCESS_STORY');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "storyType" "StoryType" NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorDesignation" TEXT,
    "quote" TEXT,
    "shortDescription" TEXT NOT NULL,
    "fullStory" TEXT NOT NULL,
    "year" TEXT,
    "location" TEXT,
    "mainImage" TEXT NOT NULL,
    "galleryImages" TEXT[],
    "keyPoints" TEXT[],
    "achievements" TEXT[],
    "status" "StoryStatus" NOT NULL DEFAULT 'PUBLISHED',
    "hiddenReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stories_slug_key" ON "stories"("slug");

-- CreateIndex
CREATE INDEX "stories_authorUserId_idx" ON "stories"("authorUserId");

-- CreateIndex
CREATE INDEX "stories_storyType_idx" ON "stories"("storyType");

-- CreateIndex
CREATE INDEX "stories_status_idx" ON "stories"("status");

-- CreateIndex
CREATE INDEX "stories_deletedAt_idx" ON "stories"("deletedAt");

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
