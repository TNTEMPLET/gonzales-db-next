import type { Prisma } from "@prisma/client";

import {
  isTournamentIncomeCategory,
  isTournamentIncomeClassification,
  resolveTournamentIncomeOrg,
} from "@/lib/tournament-income/constants";

export type TournamentIncomeFilters = {
  organizationId: NonNullable<ReturnType<typeof resolveTournamentIncomeOrg>>;
  seasonYear?: number;
  startDate?: Date;
  endDate?: Date;
  category?: ReturnType<typeof parseCategoryParam>;
  classification?: ReturnType<typeof parseClassificationParam>;
};

export function parsePositiveInt(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseDateParam(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

export function parseCategoryParam(value: string | null | undefined) {
  return isTournamentIncomeCategory(value) ? value : undefined;
}

export function parseClassificationParam(value: string | null | undefined) {
  return isTournamentIncomeClassification(value) ? value : undefined;
}

export function filtersFromSearchParams(searchParams: URLSearchParams):
  | { ok: true; filters: TournamentIncomeFilters }
  | { ok: false; error: string } {
  const organizationId = resolveTournamentIncomeOrg(
    searchParams.get("org") ?? searchParams.get("organizationId"),
  );
  if (!organizationId) return { ok: false, error: "org must be a valid bracket org" };

  const categoryRaw = searchParams.get("category");
  const classificationRaw = searchParams.get("classification");
  const category = parseCategoryParam(categoryRaw);
  const classification = parseClassificationParam(classificationRaw);
  if (categoryRaw && !category) return { ok: false, error: "category is invalid" };
  if (classificationRaw && !classification) {
    return { ok: false, error: "classification is invalid" };
  }

  const filters: TournamentIncomeFilters = {
    organizationId,
    seasonYear: parsePositiveInt(searchParams.get("seasonYear")),
    startDate: parseDateParam(searchParams.get("startDate") ?? searchParams.get("from")),
    endDate: parseDateParam(searchParams.get("endDate") ?? searchParams.get("to")),
    category,
    classification,
  };

  return { ok: true, filters };
}

export function whereFromFilters(
  filters: TournamentIncomeFilters,
): Prisma.TournamentIncomeTransactionWhereInput {
  return {
    organizationId: filters.organizationId,
    ...(filters.seasonYear ? { seasonYear: filters.seasonYear } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.classification ? { classificationStatus: filters.classification } : {}),
    ...(filters.startDate || filters.endDate
      ? {
          paypalTxDate: {
            ...(filters.startDate ? { gte: filters.startDate } : {}),
            ...(filters.endDate ? { lte: filters.endDate } : {}),
          },
        }
      : {}),
  };
}
