import { NextRequest, NextResponse } from "next/server";

import {
  recordAllStarAuditLog,
  snapshotFinalRoster,
} from "@/lib/allStar/auditLog";
import { ensureAllStarVaultFinalRosterAdmin } from "@/lib/allStar/auth";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { computeVoteSummaryRows, splitVoteSummaryRowsForRunoff } from "@/lib/allStar/voteSummary";

type FinalRosterOverrideBody = {
  cycleId?: string;
  candidateId?: string;
  override?: "SELECTED" | "REMOVED" | "SECOND_TEAM" | null;
  reason?: string | null;
};

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as FinalRosterOverrideBody;
  const cycleId = body.cycleId?.trim();
  const candidateId = body.candidateId?.trim();
  if (!cycleId || !candidateId) {
    return NextResponse.json({ error: "cycleId and candidateId are required" }, { status: 400 });
  }

  const auth = await ensureAllStarVaultFinalRosterAdmin(request, cycleId);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const candidate = await prisma.allStarCandidate.findUnique({
    where: { id: candidateId },
    select: {
      ballotCycleId: true,
      organizationId: true,
      playerFullName: true,
      finalRosterOverride: true,
      finalRosterOverrideReason: true,
      finalRosterOverrideAt: true,
      finalRosterOverrideByAdminId: true,
    },
  });
  if (!candidate || candidate.ballotCycleId !== cycleId) {
    return NextResponse.json({ error: "Candidate does not belong to cycle" }, { status: 400 });
  }

  const override =
    body.override === "SELECTED" || body.override === "REMOVED" || body.override === "SECOND_TEAM"
      ? body.override
      : null;
  const admin = await getAdminUserFromRequest(request);
  const reason = body.reason?.trim() || null;
  const beforeState = snapshotFinalRoster(candidate);

  await prisma.allStarCandidate.update({
    where: { id: candidateId },
    data:
      override === null
        ? {
            finalRosterOverride: null,
            finalRosterOverrideReason: null,
            finalRosterOverrideAt: null,
            finalRosterOverrideByAdminId: null,
          }
        : {
            finalRosterOverride: override,
            finalRosterOverrideReason: reason,
            finalRosterOverrideAt: new Date(),
            finalRosterOverrideByAdminId: admin?.id || null,
          },
  });

  const overrideLabel =
    override === "SELECTED" ? "selected"
    : override === "REMOVED" ? "removed"
    : override === "SECOND_TEAM" ? "moved to second team"
    : "cleared";
  await recordAllStarAuditLog({
    organizationId: candidate.organizationId,
    ballotCycleId: cycleId,
    entityType: "candidate",
    entityId: candidateId,
    action: "FINAL_ROSTER_OVERRIDE",
    summary: `Final roster ${overrideLabel} for ${candidate.playerFullName}`,
    beforeState,
    afterState: {
      ...beforeState,
      finalRosterOverride: override,
      finalRosterOverrideReason: reason,
      finalRosterOverrideByAdminId: admin?.id ?? null,
    },
    request,
  });

  return NextResponse.json({ success: true });
}

type BulkFinalizeBody = {
  cycleId?: string;
  topCount?: number;
};

/**
 * POST /api/admin/all-star/final-roster
 * Bulk-finalize the top N candidates by vote rank as SELECTED, clear the rest.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as BulkFinalizeBody;
  const cycleId = body.cycleId?.trim();
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const auth = await ensureAllStarVaultFinalRosterAdmin(request, cycleId);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  try {
  const cycle = await prisma.allStarBallotCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const admin = await getAdminUserFromRequest(request);
  const now = new Date();

  // Compute the vote-ranked standings (same ordering the Votes Panel uses)
  const summaryResult = await computeVoteSummaryRows(prisma, cycleId);
  const rows = summaryResult?.rows ?? [];

    if (rows.length === 0) {
    return NextResponse.json({ error: "No vote data yet — cannot finalize roster." }, { status: 422 });
  }

  // Two-team ballot (e.g. NAVY + RED for Ascension, PURPLE + GOLD for Gonzales)?
  // If so, we finalize the ENTIRE pool (both teams), not just the primary team.
  // For single-team cycles, we use the topCount sent from the UI (the "Top vote getters" field).
  const isTwoTeamCycle =
    typeof cycle.runoffFirstTeamSize === "number" &&
    cycle.runoffFirstTeamSize > 0 &&
    typeof cycle.runoffPoolSize === "number" &&
    cycle.runoffPoolSize > 0;

  let topCount: number;
  if (isTwoTeamCycle) {
    // Use the UI's "Top vote getters" count if provided, capped at runoffPoolSize.
    // This lets admins lock fewer than the full pool (e.g. 12 instead of 21).
    const defaultTop = cycle.runoffPoolSize!;
    const rawTop = typeof body.topCount === "number" && body.topCount > 0 ? body.topCount : defaultTop;
    topCount = Math.min(rawTop, cycle.runoffPoolSize!, rows.length);
  } else {
    const defaultTopCount = cycle.runoffPlayersNeeded ?? 12;
    const rawTop = typeof body.topCount === "number" && body.topCount > 0 ? body.topCount : defaultTopCount;
    topCount = Math.min(rawTop, rows.length);
  }

  // Use the SAME split logic the Votes Panel display uses:
  //   - Top topCount rows by vote rank, MINUS any manually REMOVED/SECOND_TEAM, PLUS any manually SELECTED
  // For two-team cycles we mark BOTH teams as SELECTED so the payment roster includes everyone.
  // SECOND_TEAM overrides are preserved as-is (admin explicitly placed that player on the second team).
  // The split function handles correct Navy/Red display from overrides + vote rank at render time.
  const split = splitVoteSummaryRowsForRunoff(rows, topCount);

  // For two-team cycles: finalise the whole pool (firstTeam + secondTeam), except REMOVED/SECOND_TEAM.
  // For single-team cycles: only firstTeam gets SELECTED (same as before).
  const finalRosterIds = new Set(split.firstTeam.map((r) => r.candidateId));
  if (isTwoTeamCycle) {
    for (const row of split.secondTeam) {
      if (row.finalRosterOverride !== "REMOVED" && row.finalRosterOverride !== "SECOND_TEAM") {
        finalRosterIds.add(row.candidateId);
      }
    }
  }
  const firstTeamIds = finalRosterIds;

  // Fetch all candidates for this cycle to update them
  const candidates = await prisma.allStarCandidate.findMany({
    where: { ballotCycleId: cycleId },
    select: {
      id: true,
      playerFullName: true,
      organizationId: true,
      finalRosterOverride: true,
      finalRosterOverrideReason: true,
      finalRosterOverrideAt: true,
      finalRosterOverrideByAdminId: true,
    },
  });

  // Bulk-update in a transaction.
  // Rules:
  //   • In finalRosterIds  → mark SELECTED
  //   • Already REMOVED and NOT in finalRosterIds → skip (preserve explicit removal)
  //   • Already SECOND_TEAM → skip (preserve: admin placed this player on the second team;
  //     the split function handles correct display; payment seeding includes SECOND_TEAM players)
  //   • Everyone else not in finalRosterIds → clear to null
  const updateOps = candidates
    .filter((c) => {
      if (c.finalRosterOverride === "REMOVED" && !firstTeamIds.has(c.id)) return false;
      if (c.finalRosterOverride === "SECOND_TEAM") return false;
      return true;
    })
    .map((c) => {
      if (firstTeamIds.has(c.id)) {
        return prisma.allStarCandidate.update({
          where: { id: c.id },
          data: {
            finalRosterOverride: "SELECTED",
            finalRosterOverrideReason:
              c.finalRosterOverride === "SELECTED"
                ? c.finalRosterOverrideReason
                : "Finalized from Votes Panel",
            finalRosterOverrideAt: c.finalRosterOverride === "SELECTED" ? c.finalRosterOverrideAt : now,
            finalRosterOverrideByAdminId:
              c.finalRosterOverride === "SELECTED" ? c.finalRosterOverrideByAdminId : (admin?.id ?? null),
          },
        });
      } else {
        // Not on final roster, not REMOVED, not SECOND_TEAM — clear any override
        return prisma.allStarCandidate.update({
          where: { id: c.id },
          data: {
            finalRosterOverride: null,
            finalRosterOverrideReason: null,
            finalRosterOverrideAt: null,
            finalRosterOverrideByAdminId: null,
          },
        });
      }
    });
  await prisma.$transaction(updateOps);

  // Audit log summary entry
  await recordAllStarAuditLog({
    organizationId: cycle.organizationId,
    ballotCycleId: cycleId,
    entityType: "cycle",
    entityId: cycleId,
    action: "FINAL_ROSTER_BULK_FINALIZE",
    summary: isTwoTeamCycle
      ? `Finalized roster: ${firstTeamIds.size} players selected (top ${topCount} of ${cycle.runoffPoolSize} pool, respecting manual overrides)`
      : `Finalized roster: ${firstTeamIds.size} players selected (top ${topCount} by vote, respecting manual overrides)`,
    beforeState: null,
    afterState: {
      selectedPlayerIds: Array.from(firstTeamIds),
      topCount,
      isTwoTeamCycle,
      poolSize: isTwoTeamCycle ? cycle.runoffPoolSize : null,
      firstTeamSize: isTwoTeamCycle ? cycle.runoffFirstTeamSize : null,
      finalizedAt: now.toISOString(),
      finalizedByAdminId: admin?.id ?? null,
    },
    request,
  });

  return NextResponse.json({
    success: true,
    selectedCount: firstTeamIds.size,
    totalCandidates: candidates.length,
    topCount,
  });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to finalize roster";
    console.error("[final-roster POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
