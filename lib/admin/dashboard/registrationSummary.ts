import "server-only";

import prisma from "@/lib/prisma";
import {
  getEnrollmentKpiSummary,
  type EnrollmentDivisionBreakdown,
} from "@/lib/enrollment/kpi";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import type { ContentOrgId } from "@/lib/siteConfig";

export type RegistrationOrgBreakdown = {
  organizationId: ContentOrgId;
  seasonYear: number;
  totalEnrollments: number;
  grossCents: number;
  collectedCents: number;
  outstandingCents: number;
};

export type RegistrationWeeklyPoint = {
  weekStart: string; // ISO date, Monday
  registrations: number;
  collectedCents: number;
};

export type RegistrationDivisionRow = EnrollmentDivisionBreakdown & {
  organizationId: ContentOrgId;
};

export type RegistrationSummary = {
  totalEnrollments: number;
  grossCents: number;
  collectedCents: number;
  outstandingCents: number;
  byOrg: RegistrationOrgBreakdown[];
  perDivision: RegistrationDivisionRow[];
  weeklyTrend: RegistrationWeeklyPoint[];
};

function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Cross-org registration/revenue rollup for the dashboard. Reuses
 * getEnrollmentKpiSummary() (lib/enrollment/kpi.ts) per org rather than
 * re-deriving its totals -- only the weekly trend line is new (Prisma can't
 * groupBy a truncated date, so rows are bucketed in JS, same convention as
 * computeStandingsByAgeGroup() / sortPlayersBySize()).
 */
export async function getRegistrationSummary(orgs: ContentOrgId[]): Promise<RegistrationSummary> {
  const perOrg = await Promise.all(
    orgs.map(async (organizationId) => {
      const seasonYear = getSeasonConfigForOrg(organizationId).year;
      const summary = await getEnrollmentKpiSummary({ organizationId, seasonYear });
      return { organizationId, seasonYear, summary };
    }),
  );

  const byOrg: RegistrationOrgBreakdown[] = perOrg.map(({ organizationId, seasonYear, summary }) => ({
    organizationId,
    seasonYear,
    totalEnrollments: summary.totalEnrollments,
    grossCents: summary.grossCents,
    collectedCents: summary.collectedCents,
    outstandingCents: summary.outstandingCents,
  }));

  const perDivision: RegistrationDivisionRow[] = perOrg.flatMap(({ organizationId, summary }) =>
    summary.perDivision.map((row) => ({ ...row, organizationId })),
  );

  const trendRows = await Promise.all(
    perOrg.map(({ organizationId, seasonYear }) =>
      prisma.enrollment.findMany({
        where: { organizationId, seasonYear, orderDate: { not: null } },
        select: { orderDate: true, amountPaidCents: true },
      }),
    ),
  );

  const weeklyBuckets = new Map<string, { registrations: number; collectedCents: number }>();
  for (const rows of trendRows) {
    for (const row of rows) {
      if (!row.orderDate) continue;
      const weekStart = mondayOf(row.orderDate);
      const bucket = weeklyBuckets.get(weekStart) ?? { registrations: 0, collectedCents: 0 };
      bucket.registrations += 1;
      bucket.collectedCents += row.amountPaidCents ?? 0;
      weeklyBuckets.set(weekStart, bucket);
    }
  }
  const weeklyTrend: RegistrationWeeklyPoint[] = Array.from(weeklyBuckets.entries())
    .map(([weekStart, v]) => ({ weekStart, ...v }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  return {
    totalEnrollments: byOrg.reduce((sum, o) => sum + o.totalEnrollments, 0),
    grossCents: byOrg.reduce((sum, o) => sum + o.grossCents, 0),
    collectedCents: byOrg.reduce((sum, o) => sum + o.collectedCents, 0),
    outstandingCents: byOrg.reduce((sum, o) => sum + o.outstandingCents, 0),
    byOrg,
    perDivision,
    weeklyTrend,
  };
}
