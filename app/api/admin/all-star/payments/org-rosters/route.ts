import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import {
  getCycleTierDisplayLabel,
  getRunoffVotePanelSecondaryTeamHeading,
} from "@/lib/allStar/cycleUiLabels";
import { computeVoteSummaryRows, splitVoteSummaryRowsForRunoff } from "@/lib/allStar/voteSummary";
import { resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";
import prisma from "@/lib/prisma";

function buildRosterTag(
  seasonYear: number,
  ageGroupLabel: string | null,
  ageGroup: string,
  teamColor: string,
): string {
  const age = (ageGroupLabel ?? ageGroup).trim();
  return `${seasonYear} - ${age} - ${teamColor}`;
}

// ─── GET: org-scoped payment roster summary, grouped by rosterTag ────────────
export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const orgParam = request.nextUrl.searchParams.get("org");
  const orgId = resolveAdminTargetOrg(orgParam ?? undefined);
  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : null;

  // Load all payments for this org (optionally filtered by year via cycle join)
  const payments = await prisma.allStarPayment.findMany({
    where: {
      organizationId: orgId,
      ...(year
        ? { ballotCycle: { seasonYear: year } }
        : {}),
    },
    include: {
      ballotCycle: {
        select: {
          id: true,
          seasonYear: true,
          ageGroup: true,
          allStarAgeGroupLabel: true,
          title: true,
        },
      },
    },
    orderBy: [{ team: "asc" }, { playerFullName: "asc" }],
  });

  // Get available years
  const yearSet = new Set<number>();
  for (const p of payments) yearSet.add(p.ballotCycle.seasonYear);
  const availableYears = [...yearSet].sort((a, b) => b - a);

  // Group by rosterTag (null → "(Legacy)")
  const tagMap = new Map<
    string,
    {
      ballotCycleId: string;
      seasonYear: number;
      payments: typeof payments;
    }
  >();
  for (const p of payments) {
    const legacyTeamColor = getCycleTierDisplayLabel(
      p.organizationId as "gonzales" | "ascension",
      p.ballotCycle.title,
    );
    const tag = p.rosterTag ?? `${p.ballotCycle.seasonYear} - ${p.ballotCycle.allStarAgeGroupLabel ?? p.ballotCycle.ageGroup} - ${legacyTeamColor}`;
    if (!tagMap.has(tag)) {
      tagMap.set(tag, {
        ballotCycleId: p.ballotCycleId,
        seasonYear: p.ballotCycle.seasonYear,
        payments: [],
      });
    }
    tagMap.get(tag)!.payments.push(p);
  }

  const rosters = Array.from(tagMap.entries())
    .sort(([, a], [, b]) => b.seasonYear - a.seasonYear)
    .map(([rosterTag, { ballotCycleId, seasonYear, payments: rPayments }]) => {
      const paidCount = rPayments.filter((p) => p.isPaid).length;
      const unpaidCount = rPayments.length - paidCount;
      const collectedCents = rPayments
        .filter((p) => p.isPaid)
        .reduce((s, p) => s + p.amountCents, 0);
      const outstandingCents = rPayments
        .filter((p) => !p.isPaid)
        .reduce((s, p) => s + p.amountCents, 0);
      return {
        rosterTag,
        ballotCycleId,
        seasonYear,
        summary: { total: rPayments.length, paidCount, unpaidCount, collectedCents, outstandingCents },
        payments: rPayments.map((p) => ({
          id: p.id,
          playerFullName: p.playerFullName,
          ageGroup: p.ageGroup,
          team: p.team,
          payerName: p.payerName,
          paypalTxId: p.paypalTxId,
          paypalTxDate: p.paypalTxDate?.toISOString() ?? null,
          amountCents: p.amountCents,
          isPaid: p.isPaid,
          paidAt: p.paidAt?.toISOString() ?? null,
          notes: p.notes,
          rosterTag: p.rosterTag,
        })),
      };
    });

  const grandTotal = rosters.reduce(
    (acc, r) => ({
      total: acc.total + r.summary.total,
      paidCount: acc.paidCount + r.summary.paidCount,
      unpaidCount: acc.unpaidCount + r.summary.unpaidCount,
      collectedCents: acc.collectedCents + r.summary.collectedCents,
      outstandingCents: acc.outstandingCents + r.summary.outstandingCents,
    }),
    { total: 0, paidCount: 0, unpaidCount: 0, collectedCents: 0, outstandingCents: 0 },
  );

  // ── Unseeded cycles: have finalized candidates (SELECTED or SECOND_TEAM) but no payment records yet ────
  const seededCycleIds = new Set(payments.map((p) => p.ballotCycleId));
  const finalizedFilter = { finalRosterOverride: { in: ["SELECTED" as const, "SECOND_TEAM" as const] } };
  const unseededRaw = await prisma.allStarBallotCycle.findMany({
    where: {
      organizationId: orgId,
      ...(year ? { seasonYear: year } : {}),
      ...(seededCycleIds.size > 0 ? { id: { notIn: [...seededCycleIds] } } : {}),
      candidates: { some: finalizedFilter },
    },
    select: {
      id: true,
      organizationId: true,
      seasonYear: true,
      ageGroup: true,
      allStarAgeGroupLabel: true,
      title: true,
      runoffFirstTeamSize: true,
      runoffPoolSize: true,
    },
    orderBy: [{ seasonYear: "desc" }, { ageGroup: "asc" }],
  });

  // Build unseeded cycle entries — two-team cycles produce two entries (one per team).
  const unseededCycles: Array<{
    cycleId: string;
    cycleName: string;
    seasonYear: number;
    selectedCandidateCount: number;
  }> = [];

  for (const c of unseededRaw) {
    const cOrgId = c.organizationId as ContentOrgId;
    const isTwoTeam =
      typeof c.runoffFirstTeamSize === "number" &&
      c.runoffFirstTeamSize > 0 &&
      c.runoffPoolSize != null;

    if (isTwoTeam) {
      // Use the same split the seeding handler uses so counts exactly match what will be seeded.
      const team1Color = getCycleTierDisplayLabel(cOrgId, c.title);
      const team2Color = getRunoffVotePanelSecondaryTeamHeading(cOrgId);
      const team1Tag = buildRosterTag(c.seasonYear, c.allStarAgeGroupLabel, c.ageGroup, team1Color);
      const team2Tag = buildRosterTag(c.seasonYear, c.allStarAgeGroupLabel, c.ageGroup, team2Color);

      const summaryResult = await computeVoteSummaryRows(prisma, c.id);
      const rows = summaryResult?.rows ?? [];
      const { firstTeam, secondTeam } = splitVoteSummaryRowsForRunoff(rows, c.runoffFirstTeamSize!);

      // Count finalized players landing in each team bucket
      const finalizedIds = new Set(
        (await prisma.allStarCandidate.findMany({
          where: { ballotCycleId: c.id, ...finalizedFilter },
          select: { id: true },
        })).map((cand) => cand.id),
      );
      const team1Count = firstTeam.filter((r) => finalizedIds.has(r.candidateId)).length;
      const team2Count = secondTeam.filter((r) => finalizedIds.has(r.candidateId)).length;

      unseededCycles.push({ cycleId: c.id, cycleName: team1Tag, seasonYear: c.seasonYear, selectedCandidateCount: team1Count });
      unseededCycles.push({ cycleId: c.id, cycleName: team2Tag, seasonYear: c.seasonYear, selectedCandidateCount: team2Count });
    } else {
      // Single-team cycle: one entry
      const teamColor = getCycleTierDisplayLabel(cOrgId, c.title);
      const cycleName = buildRosterTag(c.seasonYear, c.allStarAgeGroupLabel, c.ageGroup, teamColor);
      const totalCount = await prisma.allStarCandidate.count({
        where: { ballotCycleId: c.id, ...finalizedFilter },
      });
      unseededCycles.push({ cycleId: c.id, cycleName, seasonYear: c.seasonYear, selectedCandidateCount: totalCount });
    }
  }

  // Merge unseeded seasons into availableYears
  for (const c of unseededRaw) yearSet.add(c.seasonYear);
  const allAvailableYears = [...yearSet].sort((a, b) => b - a);

  return NextResponse.json({ rosters, grandTotals: grandTotal, availableYears: allAvailableYears, unseededCycles });
}
