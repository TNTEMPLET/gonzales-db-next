import type { TournamentIncomeTransaction } from "@prisma/client";

import {
  TOURNAMENT_INCOME_CATEGORIES,
  TOURNAMENT_INCOME_CLASSIFICATIONS,
  type TournamentIncomeCategoryValue,
  type TournamentIncomeClassificationValue,
} from "@/lib/tournament-income/constants";

export type TournamentIncomeBucket = {
  count: number;
  grossAmountCents: number;
  feeAmountCents: number;
  netAmountCents: number;
};

export type TournamentIncomeSummary = {
  totals: TournamentIncomeBucket;
  byCategory: Record<TournamentIncomeCategoryValue, TournamentIncomeBucket>;
  byClassification: Record<TournamentIncomeClassificationValue, TournamentIncomeBucket>;
};

function emptyBucket(): TournamentIncomeBucket {
  return { count: 0, grossAmountCents: 0, feeAmountCents: 0, netAmountCents: 0 };
}

function addToBucket(bucket: TournamentIncomeBucket, row: Pick<TournamentIncomeTransaction, "grossAmountCents" | "feeAmountCents" | "netAmountCents">) {
  bucket.count += 1;
  bucket.grossAmountCents += row.grossAmountCents;
  bucket.feeAmountCents += row.feeAmountCents;
  bucket.netAmountCents += row.netAmountCents;
}

export function summarizeTournamentIncome(
  rows: Array<Pick<TournamentIncomeTransaction, "category" | "classificationStatus" | "grossAmountCents" | "feeAmountCents" | "netAmountCents">>,
): TournamentIncomeSummary {
  const byCategory = Object.fromEntries(
    TOURNAMENT_INCOME_CATEGORIES.map((category) => [category, emptyBucket()]),
  ) as Record<TournamentIncomeCategoryValue, TournamentIncomeBucket>;
  const byClassification = Object.fromEntries(
    TOURNAMENT_INCOME_CLASSIFICATIONS.map((status) => [status, emptyBucket()]),
  ) as Record<TournamentIncomeClassificationValue, TournamentIncomeBucket>;
  const totals = emptyBucket();

  for (const row of rows) {
    addToBucket(totals, row);
    addToBucket(byCategory[row.category], row);
    addToBucket(byClassification[row.classificationStatus], row);
  }

  return {
    totals,
    byCategory,
    byClassification,
  };
}
