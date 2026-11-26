-- Packages may exist as admin-managed drafts before a vendor is assigned.
ALTER TABLE "packages" ALTER COLUMN "vendorUserId" DROP NOT NULL;
