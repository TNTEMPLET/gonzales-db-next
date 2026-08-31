import "server-only";

import prisma from "@/lib/prisma";

import {
  CREDIT_CARD_PROCESSING_FEE_RATE,
  ONLINE_REGISTRATION_FEE_CENTS_PER_PLAYER,
} from "./feeConstants";
import { sortTeamsManagementAgeGroups } from "@/lib/admin/teamsImportHelpers";

export type EnrollmentFeeTierBreakdown = {
  orderDetailDescription: string;
  count: number;
  grossCents: number;
  collectedCents: number;
};

export type EnrollmentDivisionBreakdown = {
  ageGroup: string;
  enrolled: number;
  /** Players actually rostered onto a Team in this division (from TeamPlayer, via Team._count). */
  rostered: number;
  /** enrolled minus rostered, floored at 0 — registered but not yet placed on a team. */
  unrostered: number;
  grossCents: number;
  collectedCents: number;
};

export type EnrollmentKpiSummary = {
  organizationId: string;
  seasonYear: number;
  totalEnrollments: number;
  /** Enrollment rows with no Team linked yet (registered pre-draft/pre-assignment). */
  unassignedEnrollments: number;
  grossCents: number;
  collectedCents: number;
  outstandingCents: number;
  ccProcessingFeeCents: number;
  onlineFeeCents: number;
  netDueCents: number;
  feeTierBreakdown: EnrollmentFeeTierBreakdown[];
  perDivision: EnrollmentDivisionBreakdown[];
  priorSeasonComparison: { seasonYear: number; totalEnrollments: number; grossCents: number } | null;
};

/**
 * Enrollment-derived KPI summary for one org+season — the direct answer to
 * the treasurer's manual fee-tier income report (see docs/sports-connect-import.md
 * and the Enrollment model in prisma/schema.prisma). Follows the same
 * typed-summary + pure-Prisma-aggregation pattern as
 * lib/sportsConnect/fallballCapacity.ts and getRosterQualitySummary()
 * (lib/sportsConnect/quality.ts).
 *
 * Deliberately does NOT compute a roster-capacity "fill rate" percentage —
 * fallballCapacity.ts's recommendedRosterSize() is Fall-Ball-specific
 * (hardcoded division-name matching) and doesn't generalize to gonzales/
 * ascension's own division names. Reporting enrolled-vs-rostered counts is
 * honest and directly derivable everywhere; a fabricated capacity/fill-rate
 * number for orgs with no real capacity source would not be.
 */
export async function getEnrollmentKpiSummary(input: {
  organizationId: string;
  seasonYear: number;
}): Promise<EnrollmentKpiSummary> {
  const { organizationId, seasonYear } = input;

  const [totals, unassignedCount, byDivision, byFeeTier, teamsForSeason, priorSeasonTotals] =
    await Promise.all([
      prisma.enrollment.aggregate({
        where: { organizationId, seasonYear },
        _count: { _all: true },
        _sum: { amountCents: true, amountPaidCents: true, balanceCents: true },
      }),
      prisma.enrollment.count({ where: { organizationId, seasonYear, teamId: null } }),
      prisma.enrollment.groupBy({
        by: ["ageGroup"],
        where: { organizationId, seasonYear },
        _count: { _all: true },
        _sum: { amountCents: true, amountPaidCents: true },
      }),
      prisma.enrollment.groupBy({
        by: ["orderDetailDescription"],
        where: { organizationId, seasonYear },
        _count: { _all: true },
        _sum: { amountCents: true, amountPaidCents: true },
      }),
      prisma.team.findMany({
        // Excludes the "Unallocated" catch-all team (same convention as
        // lib/admin/jerseyNumbers.ts / the finalize-division route) --
        // players sitting there haven't actually been placed on a real
        // team yet, so they shouldn't count as "rostered".
        where: { organizationId, seasonYear, NOT: { teamName: { equals: "Unallocated", mode: "insensitive" } } },
        select: { ageGroup: true, _count: { select: { players: true } } },
      }),
      prisma.enrollment.aggregate({
        where: { organizationId, seasonYear: seasonYear - 1 },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
    ]);

  const rosteredByAgeGroup = new Map<string, number>();
  for (const team of teamsForSeason) {
    rosteredByAgeGroup.set(
      team.ageGroup,
      (rosteredByAgeGroup.get(team.ageGroup) ?? 0) + team._count.players,
    );
  }

  const perDivision: EnrollmentDivisionBreakdown[] = byDivision
    .map((row) => {
      const enrolled = row._count._all;
      const rostered = rosteredByAgeGroup.get(row.ageGroup) ?? 0;
      return {
        ageGroup: row.ageGroup,
        enrolled,
        rostered,
        unrostered: Math.max(0, enrolled - rostered),
        grossCents: row._sum.amountCents ?? 0,
        collectedCents: row._sum.amountPaidCents ?? 0,
      };
    })
    // Youngest to oldest by default -- a division report reads naturally in
    // age order, not by enrollment count. Reuses the same age-extraction
    // sort as the Team-setup division dropdown (lib/admin/teamsImportHelpers.ts)
    // so both surfaces agree on ordering for the same division codes.
    .sort((a, b) => sortTeamsManagementAgeGroups(a.ageGroup, b.ageGroup));

  const feeTierBreakdown: EnrollmentFeeTierBreakdown[] = byFeeTier
    .map((row) => ({
      orderDetailDescription: row.orderDetailDescription || "(unspecified)",
      count: row._count._all,
      grossCents: row._sum.amountCents ?? 0,
      collectedCents: row._sum.amountPaidCents ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const totalEnrollments = totals._count._all;
  const grossCents = totals._sum.amountCents ?? 0;
  const collectedCents = totals._sum.amountPaidCents ?? 0;
  const outstandingCents = totals._sum.balanceCents ?? 0;
  const ccProcessingFeeCents = Math.round(collectedCents * CREDIT_CARD_PROCESSING_FEE_RATE);
  const onlineFeeCents = totalEnrollments * ONLINE_REGISTRATION_FEE_CENTS_PER_PLAYER;
  const netDueCents = collectedCents - ccProcessingFeeCents - onlineFeeCents;

  return {
    organizationId,
    seasonYear,
    totalEnrollments,
    unassignedEnrollments: unassignedCount,
    grossCents,
    collectedCents,
    outstandingCents,
    ccProcessingFeeCents,
    onlineFeeCents,
    netDueCents,
    feeTierBreakdown,
    perDivision,
    priorSeasonComparison:
      priorSeasonTotals._count._all > 0
        ? {
            seasonYear: seasonYear - 1,
            totalEnrollments: priorSeasonTotals._count._all,
            grossCents: priorSeasonTotals._sum.amountCents ?? 0,
          }
        : null,
  };
}
