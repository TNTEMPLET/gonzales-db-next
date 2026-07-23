-- Parent merch checkout drafts (structured sizes) matched via PayPal note code.
CREATE TABLE IF NOT EXISTS "MerchOrderDraft" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "paypalUrl" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "sizesJson" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "contactEmail" TEXT,
    "checkoutNote" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_payment',
    "paypalTxId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "MerchOrderDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MerchOrderDraft_code_key" ON "MerchOrderDraft"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "MerchOrderDraft_paypalTxId_key" ON "MerchOrderDraft"("paypalTxId");
CREATE INDEX IF NOT EXISTS "MerchOrderDraft_org_status_createdAt_idx" ON "MerchOrderDraft"("org", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "MerchOrderDraft_status_createdAt_idx" ON "MerchOrderDraft"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "MerchOrderDraft_productId_idx" ON "MerchOrderDraft"("productId");
