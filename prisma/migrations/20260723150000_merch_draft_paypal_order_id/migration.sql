-- Link merch drafts to PayPal Orders API (embedded checkout).
ALTER TABLE "MerchOrderDraft" ADD COLUMN IF NOT EXISTS "paypalOrderId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "MerchOrderDraft_paypalOrderId_key" ON "MerchOrderDraft"("paypalOrderId");
