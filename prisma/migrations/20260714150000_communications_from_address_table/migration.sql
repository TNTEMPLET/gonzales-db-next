-- CreateTable
CREATE TABLE "CommunicationFromAddress" (
    "id" TEXT NOT NULL,
    "fromHeader" TEXT NOT NULL,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationFromAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationFromAddress_fromHeader_key" ON "CommunicationFromAddress"("fromHeader");

-- CreateIndex
CREATE INDEX "CommunicationFromAddress_isActive_sortOrder_idx" ON "CommunicationFromAddress"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "CommunicationFromAddress_isDefault_idx" ON "CommunicationFromAddress"("isDefault");

-- AddForeignKey
ALTER TABLE "CommunicationFromAddress" ADD CONSTRAINT "CommunicationFromAddress_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed initial From options (same as previous hard-coded list)
INSERT INTO "CommunicationFromAddress" ("id", "fromHeader", "label", "isDefault", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('cmafromseed0000000000000001', 'AP Baseball <noreply@apbaseball.com>', 'Default noreply', true, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmafromseed0000000000000002', 'AP Baseball <communications@apbaseball.com>', 'Communications', false, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmafromseed0000000000000003', 'AP Baseball Board <apboard@apbaseball.com>', 'Board', false, true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cmafromseed0000000000000004', 'AP Baseball Support <support@apbaseball.com>', 'Support', false, true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
