-- CreateTable
CREATE TABLE "OrgAlert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "allParksOut" BOOLEAN NOT NULL DEFAULT true,
    "venues" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgAlert_organizationId_expiresAt_idx" ON "OrgAlert"("organizationId", "expiresAt");
