import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCycleTierDisplayLabel } from "@/lib/allStar/cycleUiLabels";
import prisma from "@/lib/prisma";

const ALL_STAR_FEE_CENTS = 9500; // $95.00
const MAX_FEE_CENTS = 100_000;   // $1,000.00 upper-bound sanity check

type SelectedCandidate = {
  sourceCandidateId: string;
};

/**
 * POST /api/admin/all-star/payments/coach-roster
 *
 * Creates a new "coach-selected" All-Star ballot cycle, copies the chosen
 * candidates into it (with finalRosterOverride = SELECTED), and seeds payment
 * records for each one — all in a single request.
 *
 * The cycle is created with status = CLOSED because coach-selected teams are
 * assembled manually by coaches, not through a ballot-voting flow.
 *
 * Body:
 * {
 *   organizationId: "gonzales" | "ascension",
 *   seasonYear: number,
 *   ageGroup: string,          // e.g. "12U DYB"
 *   teamColor: "GOLD" | "PURPLE" | "NAVY" | "RED",
 *   allStarAgeGroupLabel?: string,  // defaults to ageGroup
 *   selectedCandidates: { sourceCandidateId: string }[],
 *   feeCents?: number,         // default 9500, integer, max 100000
 * }
 *
 * Master admin only.
 */
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminUser.isMaster)
    return NextResponse.json({ error: "Forbidden — master admin only" }, { status: 403 });

  const body = (await request.json()) as {
    organizationId?: string;
    seasonYear?: number;
    ageGroup?: string;
    teamColor?: string;
    allStarAgeGroupLabel?: string;
    selectedCandidates?: SelectedCandidate[];
    feeCents?: number;
  };

  // ── Validate required fields ──────────────────────────────────────────────
  const orgId = (body.organizationId ?? "").trim();
  const seasonYear =
    typeof body.seasonYear === "number" && Number.isInteger(body.seasonYear) && body.seasonYear > 2000
      ? body.seasonYear
      : null;
  const ageGroup = (body.ageGroup ?? "").trim();
  const teamColor = (body.teamColor ?? "").trim().toUpperCase();
  const allStarAgeGroupLabel = (body.allStarAgeGroupLabel ?? ageGroup).trim() || ageGroup;
  const rawCandidates: SelectedCandidate[] = Array.isArray(body.selectedCandidates)
    ? body.selectedCandidates
    : [];

  // feeCents must be a positive integer within a reasonable range
  const rawFeeCents = body.feeCents;
  const feeCents =
    rawFeeCents === undefined
      ? ALL_STAR_FEE_CENTS
      : Number.isInteger(rawFeeCents) && rawFeeCents > 0 && rawFeeCents <= MAX_FEE_CENTS
        ? rawFeeCents
        : null;

  if (!["gonzales", "ascension"].includes(orgId)) {
    return NextResponse.json({ error: "organizationId must be gonzales or ascension" }, { status: 400 });
  }
  if (!seasonYear) {
    return NextResponse.json({ error: "seasonYear must be a valid integer year (e.g. 2026)" }, { status: 400 });
  }
  if (!ageGroup) {
    return NextResponse.json({ error: "ageGroup is required (e.g. 12U DYB)" }, { status: 400 });
  }
  if (!["GOLD", "PURPLE", "NAVY", "RED"].includes(teamColor)) {
    return NextResponse.json({ error: "teamColor must be one of: GOLD, PURPLE, NAVY, RED" }, { status: 400 });
  }
  if (feeCents === null) {
    return NextResponse.json(
      { error: `feeCents must be a positive integer no greater than ${MAX_FEE_CENTS}` },
      { status: 400 },
    );
  }
  if (rawCandidates.length === 0) {
    return NextResponse.json({ error: "At least one candidate must be selected" }, { status: 400 });
  }

  // Extract and deduplicate source candidate IDs (strings only)
  const sourceCandidateIds = [
    ...new Set(
      rawCandidates
        .map((c) => (typeof c.sourceCandidateId === "string" ? c.sourceCandidateId.trim() : ""))
        .filter(Boolean),
    ),
  ];
  if (sourceCandidateIds.length === 0) {
    return NextResponse.json({ error: "No valid sourceCandidateId values provided" }, { status: 400 });
  }

  // ── Check for duplicate cycle ─────────────────────────────────────────────
  // title = teamColor so getCycleTierDisplayLabel returns the right color word
  const existingCycle = await prisma.allStarBallotCycle.findFirst({
    where: { organizationId: orgId, seasonYear, ageGroup, title: teamColor },
    select: { id: true },
  });
  if (existingCycle) {
    return NextResponse.json(
      {
        error: `A ${teamColor} cycle for ${seasonYear} ${ageGroup} already exists for this organization.`,
        existingCycleId: existingCycle.id,
      },
      { status: 409 },
    );
  }

  // ── Verify all source candidates exist AND belong to the same org ─────────
  // This prevents cross-org data leakage and client-side spoofing of player data.
  const sourceCandidates = await prisma.allStarCandidate.findMany({
    where: {
      id: { in: sourceCandidateIds },
      organizationId: orgId, // must belong to the target org
    },
    select: { id: true, playerFullName: true, team: true, jerseyNumber: true, organizationId: true },
  });

  const sourceById = new Map(sourceCandidates.map((c) => [c.id, c]));

  // Reject any IDs that weren't found or didn't pass the org filter
  const missingIds = sourceCandidateIds.filter((id) => !sourceById.has(id));
  if (missingIds.length > 0) {
    return NextResponse.json(
      {
        error: `${missingIds.length} candidate(s) not found or do not belong to this organization.`,
      },
      { status: 400 },
    );
  }

  // ── Create cycle + candidates + payments in one transaction ───────────────
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create the new cycle (CLOSED — no voting required for coach-selected teams)
    const cycle = await tx.allStarBallotCycle.create({
      data: {
        organizationId: orgId,
        seasonYear,
        ageGroup,
        title: teamColor,           // "GOLD" / "PURPLE" / etc — getCycleTierDisplayLabel handles this
        allStarAgeGroupLabel,
        status: "CLOSED",
        closedAt: new Date(),
        createdByAdminId: adminUser.id,
        hasShowcase: false,         // coach-selected teams don't go through showcase/ballot
      },
    });

    const rosterTag = `${seasonYear} - ${allStarAgeGroupLabel} - ${teamColor}`;

    // 2. Create AllStarCandidate records (copies from source cycles; player data from DB only)
    const newCandidates = await Promise.all(
      sourceCandidateIds.map((sourceId) => {
        const src = sourceById.get(sourceId)!; // guaranteed present — checked above
        return tx.allStarCandidate.create({
          data: {
            ballotCycleId: cycle.id,
            organizationId: orgId,
            ageGroup,
            playerFullName: src.playerFullName,
            team: src.team,
            jerseyNumber: src.jerseyNumber,
            finalRosterOverride: "SELECTED",
            finalRosterOverrideAt: new Date(),
            finalRosterOverrideByAdminId: adminUser.id,
          },
          select: { id: true, playerFullName: true, team: true },
        });
      }),
    );

    // 3. Seed AllStarPayment records
    const payments = await Promise.all(
      newCandidates.map((cand) =>
        tx.allStarPayment.create({
          data: {
            organizationId: orgId,
            ballotCycleId: cycle.id,
            candidateId: cand.id,
            playerFullName: cand.playerFullName,
            ageGroup,
            team: cand.team,
            amountCents: feeCents,
            isPaid: false,
            rosterTag,
          },
          select: { id: true },
        }),
      ),
    );

    return { cycle, newCandidates, payments, rosterTag };
  });

  const orgIdTyped = orgId as "gonzales" | "ascension";
  const cycleName = `${seasonYear} - ${allStarAgeGroupLabel} - ${getCycleTierDisplayLabel(orgIdTyped, teamColor)}`;

  return NextResponse.json({
    success: true,
    cycleId: result.cycle.id,
    cycleName,
    rosterTag: result.rosterTag,
    playersCreated: result.newCandidates.length,
    paymentsSeeded: result.payments.length,
  });
}
