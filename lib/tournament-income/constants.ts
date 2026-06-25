import type {
  TournamentIncomeCategory,
  TournamentIncomeClassificationStatus,
} from "@prisma/client";

import { isBracketOrgId, type BracketOrgId } from "@/lib/siteConfig";

export const DEFAULT_TOURNAMENT_INCOME_ORG: BracketOrgId = "ladistrict6";

export const TOURNAMENT_INCOME_CATEGORIES = [
  "ENTRY_FEE",
  "SPONSOR",
  "MERCHANDISE",
  "GATE",
  "OTHER",
] as const satisfies readonly TournamentIncomeCategory[];

export const TOURNAMENT_INCOME_CLASSIFICATIONS = [
  "MATCHED",
  "UNMATCHED",
  "IGNORED",
  "MANUAL",
] as const satisfies readonly TournamentIncomeClassificationStatus[];

export type TournamentIncomeCategoryValue = (typeof TOURNAMENT_INCOME_CATEGORIES)[number];
export type TournamentIncomeClassificationValue =
  (typeof TOURNAMENT_INCOME_CLASSIFICATIONS)[number];

export const TOURNAMENT_INCOME_CATEGORY_LABELS: Record<TournamentIncomeCategoryValue, string> = {
  ENTRY_FEE: "Entry fees",
  SPONSOR: "Sponsors",
  MERCHANDISE: "Merchandise",
  GATE: "Gate",
  OTHER: "Other / unmatched",
};

export const TOURNAMENT_INCOME_CLASSIFICATION_LABELS: Record<TournamentIncomeClassificationValue, string> = {
  MATCHED: "Auto-classified",
  UNMATCHED: "Needs review",
  IGNORED: "Ignored",
  MANUAL: "Manual override",
};

export function isTournamentIncomeCategory(
  value: string | null | undefined,
): value is TournamentIncomeCategoryValue {
  return TOURNAMENT_INCOME_CATEGORIES.includes(value as TournamentIncomeCategoryValue);
}

export function isTournamentIncomeClassification(
  value: string | null | undefined,
): value is TournamentIncomeClassificationValue {
  return TOURNAMENT_INCOME_CLASSIFICATIONS.includes(
    value as TournamentIncomeClassificationValue,
  );
}

export function resolveTournamentIncomeOrg(
  value: string | null | undefined,
): BracketOrgId | null {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_TOURNAMENT_INCOME_ORG;
  return isBracketOrgId(trimmed) ? trimmed : null;
}

export function seasonYearFromDate(date: Date): number {
  return Number.isFinite(date.getTime()) ? date.getFullYear() : new Date().getFullYear();
}
