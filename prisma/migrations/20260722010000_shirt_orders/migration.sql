-- Championship / merchandise shirt orders (mirrors parent cap orders)

CREATE TABLE IF NOT EXISTS "ShirtOrderRecord" (
    "id" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "payerName" TEXT,
    "payerEmail" TEXT,
    "amountCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "itemName" TEXT,
    "txDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShirtOrderRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShirtOrderRecord_txId_key" ON "ShirtOrderRecord"("txId");
CREATE INDEX IF NOT EXISTS "ShirtOrderRecord_org_txDate_idx" ON "ShirtOrderRecord"("org", "txDate");
CREATE INDEX IF NOT EXISTS "ShirtOrderRecord_txDate_idx" ON "ShirtOrderRecord"("txDate");

CREATE TABLE IF NOT EXISTS "ShirtOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShirtOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShirtOrderItem_orderId_seq_key" ON "ShirtOrderItem"("orderId", "seq");
CREATE INDEX IF NOT EXISTS "ShirtOrderItem_orderId_idx" ON "ShirtOrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "ShirtOrderItem_status_idx" ON "ShirtOrderItem"("status");

DO $$ BEGIN
  ALTER TABLE "ShirtOrderItem"
    ADD CONSTRAINT "ShirtOrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "ShirtOrderRecord"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
