-- Runtime open/closed status for merch catalog SKUs (admin toggle, no code deploy).
CREATE TABLE IF NOT EXISTS "MerchProductStatus" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "activeFrom" TIMESTAMP(3),
    "activeTo" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAdminId" TEXT,

    CONSTRAINT "MerchProductStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MerchProductStatus_productId_key" ON "MerchProductStatus"("productId");
CREATE INDEX IF NOT EXISTS "MerchProductStatus_enabled_idx" ON "MerchProductStatus"("enabled");

DO $$ BEGIN
  ALTER TABLE "MerchProductStatus"
    ADD CONSTRAINT "MerchProductStatus_updatedByAdminId_fkey"
    FOREIGN KEY ("updatedByAdminId") REFERENCES "AdminUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
