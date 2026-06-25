-- Tournament income ledger imported from PayPal reports.
CREATE TYPE "TournamentIncomeCategory" AS ENUM (
  'ENTRY_FEE',
  'SPONSOR',
  'MERCHANDISE',
  'GATE',
  'OTHER'
);

CREATE TYPE "TournamentIncomeClassificationStatus" AS ENUM (
  'MATCHED',
  'UNMATCHED',
  'IGNORED',
  'MANUAL'
);

CREATE TABLE "TournamentIncomeTransaction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "seasonYear" INTEGER NOT NULL,
  "bracketProjectId" TEXT,
  "category" "TournamentIncomeCategory" NOT NULL DEFAULT 'OTHER',
  "paypalTxId" TEXT NOT NULL,
  "paypalTxDate" TIMESTAMP(3) NOT NULL,
  "paypalStatus" TEXT,
  "payerName" TEXT,
  "payerEmail" TEXT,
  "itemName" TEXT,
  "paypalNote" TEXT,
  "paypalMemo" TEXT,
  "grossAmountCents" INTEGER NOT NULL,
  "feeAmountCents" INTEGER NOT NULL DEFAULT 0,
  "netAmountCents" INTEGER NOT NULL,
  "classificationStatus" "TournamentIncomeClassificationStatus" NOT NULL DEFAULT 'UNMATCHED',
  "adminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TournamentIncomeTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TIncomeTx_org_paypalTx_key"
  ON "TournamentIncomeTransaction"("organizationId", "paypalTxId");

CREATE INDEX "TIncomeTx_org_paypalDate_idx"
  ON "TournamentIncomeTransaction"("organizationId", "paypalTxDate");

CREATE INDEX "TIncomeTx_org_season_category_idx"
  ON "TournamentIncomeTransaction"("organizationId", "seasonYear", "category");

CREATE INDEX "TIncomeTx_org_classification_idx"
  ON "TournamentIncomeTransaction"("organizationId", "classificationStatus");

CREATE INDEX "TIncomeTx_org_bracket_idx"
  ON "TournamentIncomeTransaction"("organizationId", "bracketProjectId");

CREATE INDEX "TIncomeTx_bracket_idx"
  ON "TournamentIncomeTransaction"("bracketProjectId");

ALTER TABLE "TournamentIncomeTransaction"
  ADD CONSTRAINT "TournamentIncomeTransaction_bracketProjectId_fkey"
  FOREIGN KEY ("bracketProjectId") REFERENCES "BracketProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
