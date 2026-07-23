-- AlterTable
ALTER TABLE "ShirtOrderItem" ADD COLUMN IF NOT EXISTS "sizeLabel" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MerchProduct" (
    "id" TEXT NOT NULL,
    "orgsJson" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "paypalUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "badge" TEXT,
    "checkoutHintsJson" TEXT,
    "maxQuantity" INTEGER,
    "fulfillment" TEXT NOT NULL DEFAULT 'shirt-orders',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "activeFrom" TIMESTAMP(3),
    "activeTo" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByAdminId" TEXT,

    CONSTRAINT "MerchProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MerchProduct_active_enabled_sortOrder_idx" ON "MerchProduct"("active", "enabled", "sortOrder");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MerchProduct" ADD CONSTRAINT "MerchProduct_updatedByAdminId_fkey"
    FOREIGN KEY ("updatedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
