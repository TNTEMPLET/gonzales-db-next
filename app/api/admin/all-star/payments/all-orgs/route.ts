import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCycleTierDisplayLabel } from "@/lib/allStar/cycleUiLabels";
import prisma from "@/lib/prisma";
import { withTransientDbRetry } from "@/lib/prismaRetry";
import { CONTENT_ORGS, type ContentOrgId } from "@/lib/siteConfig";

const ORG_LABELS: Record<ContentOrgId, string> = {
  gonzales: "Gonzales Diamond Baseball",
  ascension: "Ascension Little League",
};

// ─── GET: cross-org payment summary (master admin only) ─────────────────────
export async function GET(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminUser.isMaster) return NextResponse.json({ error: "Forbidden — master admin only" }, { status: 403 });

  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : null;
  const orgParam = request.nextUrl.searchParams.get("org");
  const orgFilter = orgParam === "gonzales" || orgParam === "ascension" ? orgParam : null;

  try {
  const cycles = await withTransientDbRetry(() =>
    prisma.allStarBallotCycle.findMany({
      where: {
        ...(year ? { seasonYear: year } : {}),
        ...(orgFilter ? { organizationId: orgFilter } : {}),
      },
      orderBy: [{ organizationId: "asc" }, { seasonYear: "desc" }, { ageGroup: "asc" }],
      select: {
        id: true,
        organizationId: true,
        seasonYear: true,
        ageGroup: true,
        allStarAgeGroupLabel: true,
        title: true,
        status: true,
      },
    }),
  );

  const cycleIds = cycles.map((c) => c.id);
  const [allPayments, finalizedGroups] = cycleIds.length
    ? await withTransientDbRetry(() =>
        Promise.all([
          prisma.allStarPayment.findMany({
            where: { ballotCycleId: { in: cycleIds } },
            orderBy: [{ team: "asc" }, { playerFullName: "asc" }],
          }),
          prisma.allStarCandidate.groupBy({
            by: ["ballotCycleId"],
            where: {
              ballotCycleId: { in: cycleIds },
              finalRosterOverride: { in: ["SELECTED", "SECOND_TEAM"] },
            },
            _count: { _all: true },
          }),
        ]),
      )
    : [[], []];

  const finalizedByCycle = new Map<string, number>();
  for (const row of finalizedGroups) {
    finalizedByCycle.set(row.ballotCycleId, row._count._all);
  }

  // Group payments by cycleId
  const paymentsByCycle = new Map<string, typeof allPayments>();
  for (const p of allPayments) {
    const list = paymentsByCycle.get(p.ballotCycleId) ?? [];
    list.push(p);
    paymentsByCycle.set(p.ballotCycleId, list);
  }

  const orgsToInclude = orgFilter ? CONTENT_ORGS.filter((o) => o === orgFilter) : CONTENT_ORGS;
  const orgs = orgsToInclude.map((orgId) => {
    const orgCycles = cycles.filter((c) => c.organizationId === orgId);
    let orgTotal = 0, orgPaid = 0, orgCollectedCents = 0, orgOutstandingCents = 0;

    const cycleRows = orgCycles.map((cycle) => {
      const payments = paymentsByCycle.get(cycle.id) ?? [];
      const paidCount = payments.filter((p) => p.isPaid).length;
      const unpaidCount = payments.length - paidCount;
      const collectedCents = payments.filter((p) => p.isPaid).reduce((s, p) => s + p.amountCents, 0);
      const outstandingCents = payments.filter((p) => !p.isPaid).reduce((s, p) => s + p.amountCents, 0);

      orgTotal += payments.length;
      orgPaid += paidCount;
      orgCollectedCents += collectedCents;
      orgOutstandingCents += outstandingCents;

      // Group payments by rosterTag within the cycle.
      // Legacy records (rosterTag = null) fall back to a computed name — no "(Legacy)" label.
      const fallbackAgeLabel = cycle.allStarAgeGroupLabel || cycle.ageGroup;
      const fallbackTeamColor = getCycleTierDisplayLabel(cycle.organizationId as ContentOrgId, cycle.title);
      const fallbackTag = `${cycle.seasonYear} - ${fallbackAgeLabel} - ${fallbackTeamColor}`;
      const rosterTagMap = new Map<string, typeof allPayments>();
      for (const p of payments) {
        const tag = p.rosterTag ?? fallbackTag;
        const list = rosterTagMap.get(tag) ?? [];
        list.push(p);
        rosterTagMap.set(tag, list);
      }

      const rosters = Array.from(rosterTagMap.entries()).map(([rosterTag, rPayments]) => {
        const rPaid = rPayments.filter((p) => p.isPaid).length;
        const rUnpaid = rPayments.length - rPaid;
        const rCollected = rPayments.filter((p) => p.isPaid).reduce((s, p) => s + p.amountCents, 0);
        const rOutstanding = rPayments.filter((p) => !p.isPaid).reduce((s, p) => s + p.amountCents, 0);
        return {
          rosterTag,
          summary: {
            total: rPayments.length,
            paidCount: rPaid,
            unpaidCount: rUnpaid,
            collectedCents: rCollected,
            outstandingCents: rOutstanding,
          },
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

      const ageLabel = cycle.allStarAgeGroupLabel || cycle.ageGroup;
      const teamColor = getCycleTierDisplayLabel(cycle.organizationId as ContentOrgId, cycle.title);

      return {
        cycleId: cycle.id,
        cycleName: `${cycle.seasonYear} - ${ageLabel} - ${teamColor}`,
        seasonYear: cycle.seasonYear,
        ageGroup: cycle.ageGroup,
        finalizedCount: finalizedByCycle.get(cycle.id) ?? 0,
        summary: {
          total: payments.length,
          paidCount,
          unpaidCount,
          collectedCents,
          outstandingCents,
        },
        rosters,
      };
    });

    return {
      orgId,
      orgName: ORG_LABELS[orgId],
      totals: {
        total: orgTotal,
        paidCount: orgPaid,
        unpaidCount: orgTotal - orgPaid,
        collectedCents: orgCollectedCents,
        outstandingCents: orgOutstandingCents,
      },
      cycles: cycleRows,
    };
  });

  const grandTotal = orgs.reduce(
    (acc, o) => ({
      total: acc.total + o.totals.total,
      paidCount: acc.paidCount + o.totals.paidCount,
      unpaidCount: acc.unpaidCount + o.totals.unpaidCount,
      collectedCents: acc.collectedCents + o.totals.collectedCents,
      outstandingCents: acc.outstandingCents + o.totals.outstandingCents,
    }),
    { total: 0, paidCount: 0, unpaidCount: 0, collectedCents: 0, outstandingCents: 0 },
  );

  const allYears = [...new Set(cycles.map((c) => c.seasonYear))].sort((a, b) => b - a);

  return NextResponse.json({ orgs, grandTotals: grandTotal, availableYears: allYears });
  } catch (err: unknown) {
    console.error("[all-orgs payments GET]", err);
    const message =
      err instanceof Error && /fetch failed|Connect Timeout|504 Gateway/i.test(err.message)
        ? "Database connection timed out. Wait a moment and refresh."
        : "Failed to load payment summary.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

