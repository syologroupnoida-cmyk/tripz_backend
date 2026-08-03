/*
  Warnings:

  - You are about to drop the column `pricePerNightInPaise` on the `property_bookings` table. All the data in the column will be lost.
  - You are about to drop the column `roomId` on the `property_bookings` table. All the data in the column will be lost.
  - You are about to drop the column `unitsBooked` on the `property_bookings` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "property_bookings" DROP CONSTRAINT "property_bookings_roomId_fkey";

-- DropIndex
DROP INDEX "property_bookings_roomId_checkIn_checkOut_status_idx";

-- AlterTable
ALTER TABLE "property_bookings" DROP COLUMN "pricePerNightInPaise",
DROP COLUMN "roomId",
DROP COLUMN "unitsBooked";

-- CreateTable
CREATE TABLE "property_booking_items" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "unitsBooked" INTEGER NOT NULL,
    "pricePerNightInPaise" INTEGER NOT NULL,
    "subtotalInPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_booking_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_booking_items_roomId_bookingId_idx" ON "property_booking_items"("roomId", "bookingId");

-- CreateIndex
CREATE INDEX "property_booking_items_bookingId_idx" ON "property_booking_items"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "property_booking_items_bookingId_roomId_key" ON "property_booking_items"("bookingId", "roomId");

-- CreateIndex
CREATE INDEX "property_bookings_checkIn_checkOut_status_idx" ON "property_bookings"("checkIn", "checkOut", "status");

-- AddForeignKey
ALTER TABLE "property_booking_items" ADD CONSTRAINT "property_booking_items_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "property_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_booking_items" ADD CONSTRAINT "property_booking_items_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "property_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
