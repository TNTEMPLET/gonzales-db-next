import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin, ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import {
  computeVoteSummaryRows,
  splitVoteSummaryRowsForRunoff,
} from "@/lib/allStar/voteSummary";
import {
  getCycleTierDisplayLabel,
  getRunoffVotePanelSecondaryTeamHeading,
} from "@/lib/allStar/cycleUiLabels";

const ALL_STAR_FEE_CENTS = 9500; // $95.00

// ─── Derive a human-readable rosterTag for a cycle ───────────────────────────
function buildRosterTag(
  seasonYear: number,
  ageGroupLabel: string | null,
  ageGroup: string,
  teamColor: string,
): string {
  const age = (ageGroupLabel ?? ageGroup).trim();
  return `${seasonYear} - ${age} - ${teamColor}`;
}

// ─── GET: list payment records for a cycle ──────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      organizationId: true,
      seasonYear: true,
      ageGroup: true,
      allStarAgeGroupLabel: true,
      title: true,
    },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const payments = await prisma.allStarPayment.findMany({
    where: { ballotCycleId: cycleId },
    orderBy: [{ team: "asc" }, { playerFullName: "asc" }],
  });

  const paidCount = payments.filter((p) => p.isPaid).length;
  const unpaidCount = payments.length - paidCount;
  const collectedCents = payments.filter((p) => p.isPaid).reduce((s, p) => s + p.amountCents, 0);
  const outstandingCents = payments.filter((p) => !p.isPaid).reduce((s, p) => s + p.amountCents, 0);

  return NextResponse.json({
    cycle,
    payments: payments.map(serializePayment),
    summary: { total: payments.length, paidCount, unpaidCount, collectedCents, outstandingCents },
  });
}

// ─── POST: seed payments from cycle roster OR add manual entry ───────────────
export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as {
    intent: "seed_from_roster" | "add_manual";
    cycleId?: string;
    feeCents?: number;
    playerFullName?: string;
    ageGroup?: string;
    team?: string;
    organizationId?: string;
  };

  if (!body.cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const cycle = await prisma.allStarBallotCycle.findUnique({ where: { id: body.cycleId } });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  if (body.intent === "seed_from_roster") {
    const feeCents =
      typeof body.feeCents === "number" && body.feeCents > 0 ? body.feeCents : ALL_STAR_FEE_CENTS;

    const isTwoTeamCycle =
      cycle.runoffFirstTeamSize != null &&
      cycle.runoffFirstTeamSize > 0 &&
      cycle.runoffPoolSize != null;

    if (isTwoTeamCycle) {
      // ── Two-team roster: split by vote standings ──────────────────────────
      const result = await computeVoteSummaryRows(prisma, body.cycleId);
      if (!result) {
        return NextResponse.json({ error: "Failed to compute vote standings" }, { status: 500 });
      }
      const { firstTeam, secondTeam } = splitVoteSummaryRowsForRunoff(result.rows, cycle.runoffFirstTeamSize!);

      const orgId = cycle.organizationId as "gonzales" | "ascension";
      const team1Tag = buildRosterTag(cycle.seasonYear, cycle.allStarAgeGroupLabel, cycle.ageGroup, getCycleTierDisplayLabel(orgId, cycle.title));
      const team2Tag = buildRosterTag(cycle.seasonYear, cycle.allStarAgeGroupLabel, cycle.ageGroup, getRunoffVotePanelSecondaryTeamHeading(orgId));

      const candidateTagMap = new Map<string, string>();
      for (const row of firstTeam) candidateTagMap.set(row.candidateId, team1Tag);
      for (const row of secondTeam) candidateTagMap.set(row.candidateId, team2Tag);

      // Load selected candidates + all existing payments in 2 queries
      const [selectedCandidates, existingPayments] = await Promise.all([
        prisma.allStarCandidate.findMany({
          where: { ballotCycleId: body.cycleId, finalRosterOverride: { in: ["SELECTED", "SECOND_TEAM"] } },
          orderBy: [{ team: "asc" }, { playerFullName: "asc" }],
        }),
        prisma.allStarPayment.findMany({
          where: { ballotCycleId: body.cycleId, candidateId: { not: null } },
          select: { id: true, candidateId: true, rosterTag: true, isPaid: true, paypalTxId: true },
        }),
      ]);

      const existingByCandidateId = new Map(existingPayments.map((p) => [p.candidateId!, p]));
      const selectedIds = new Set(selectedCandidates.map((c) => c.id));

      // Delete stale unpaid records for candidates no longer on the roster
      const toDelete = existingPayments.filter(
        (p) => p.candidateId && !selectedIds.has(p.candidateId) && !p.isPaid && !p.paypalTxId,
      );
      if (toDelete.length > 0) {
        await prisma.allStarPayment.deleteMany({ where: { id: { in: toDelete.map((p) => p.id) } } });
      }

      // Partition into new creates vs tag updates
      const toCreate: Array<{ organizationId: string; ballotCycleId: string; candidateId: string; playerFullName: string; ageGroup: string; team: string; amountCents: number; rosterTag: string; }> = [];
      const toUpdateTag: Array<{ id: string; rosterTag: string }> = [];
      let skipped = 0;

      for (const candidate of selectedCandidates) {
        const tag = candidateTagMap.get(candidate.id) ?? team1Tag;
        const existing = existingByCandidateId.get(candidate.id);
        if (existing) {
          if (existing.rosterTag !== tag) toUpdateTag.push({ id: existing.id, rosterTag: tag });
          skipped++;
        } else {
          toCreate.push({
            organizationId: cycle.organizationId,
            ballotCycleId: cycle.id,
            candidateId: candidate.id,
            playerFullName: candidate.playerFullName,
            ageGroup: candidate.ageGroup,
            team: candidate.team,
            amountCents: feeCents,
            rosterTag: tag,
          });
        }
      }

      // Batch create + any tag corrections (usually 0)
      if (toCreate.length > 0) await prisma.allStarPayment.createMany({ data: toCreate });
      for (const { id, rosterTag } of toUpdateTag) {
        await prisma.allStarPayment.update({ where: { id }, data: { rosterTag } });
      }

      return NextResponse.json({
        success: true,
        created: toCreate.length,
        skipped,
        removed: toDelete.length,
        source: "final_roster",
        sourceCount: selectedCandidates.length,
      });
    }

    // ── Single-team roster ────────────────────────────────────────────────────
    const singleOrgId = cycle.organizationId as "gonzales" | "ascension";
    const rosterTag = buildRosterTag(
      cycle.seasonYear,
      cycle.allStarAgeGroupLabel,
      cycle.ageGroup,
      getCycleTierDisplayLabel(singleOrgId, cycle.title),
    );

    const finalRosterCandidates = await prisma.allStarCandidate.findMany({
      where: { ballotCycleId: body.cycleId, finalRosterOverride: { in: ["SELECTED", "SECOND_TEAM"] } },
      orderBy: [{ team: "asc" }, { playerFullName: "asc" }],
    });
    const usingFinalRoster = finalRosterCandidates.length > 0;

    const candidates = usingFinalRoster
      ? finalRosterCandidates
      : await prisma.allStarCandidate.findMany({
          where: { ballotCycleId: body.cycleId, isActive: true },
          orderBy: [{ team: "asc" }, { playerFullName: "asc" }],
        });

    // Load all existing payments for this cycle in one shot
    const existingPayments = await prisma.allStarPayment.findMany({
      where: { ballotCycleId: body.cycleId, candidateId: { not: null } },
      select: { id: true, candidateId: true, rosterTag: true, isPaid: true, paypalTxId: true },
    });
    const existingByCandidateId = new Map(existingPayments.map((p) => [p.candidateId!, p]));

    // Remove stale unpaid records if using final roster
    let removed = 0;
    if (usingFinalRoster) {
      const finalCandidateIds = new Set(candidates.map((c) => c.id));
      const toDelete = existingPayments.filter(
        (p) => p.candidateId && !finalCandidateIds.has(p.candidateId) && !p.isPaid && !p.paypalTxId,
      );
      if (toDelete.length > 0) {
        await prisma.allStarPayment.deleteMany({ where: { id: { in: toDelete.map((p) => p.id) } } });
        removed = toDelete.length;
        // Remove deleted from the map so we don't try to update them
        for (const p of toDelete) existingByCandidateId.delete(p.candidateId!);
      }
    }

    // Partition into creates vs tag backfills
    const toCreate: Array<{ organizationId: string; ballotCycleId: string; candidateId: string; playerFullName: string; ageGroup: string; team: string; amountCents: number; rosterTag: string; }> = [];
    const toBackfillTag: string[] = []; // ids needing rosterTag set
    let skipped = 0;

    for (const candidate of candidates) {
      const existing = existingByCandidateId.get(candidate.id);
      if (existing) {
        if (!existing.rosterTag) toBackfillTag.push(existing.id);
        skipped++;
      } else {
        toCreate.push({
          organizationId: cycle.organizationId,
          ballotCycleId: cycle.id,
          candidateId: candidate.id,
          playerFullName: candidate.playerFullName,
          ageGroup: candidate.ageGroup,
          team: candidate.team,
          amountCents: feeCents,
          rosterTag,
        });
      }
    }

    if (toCreate.length > 0) await prisma.allStarPayment.createMany({ data: toCreate });
    // Backfill missing rosterTags (usually 0 after initial migration)
    for (const id of toBackfillTag) {
      await prisma.allStarPayment.update({ where: { id }, data: { rosterTag } });
    }

    return NextResponse.json({
      success: true,
      created: toCreate.length,
      skipped,
      removed,
      source: usingFinalRoster ? "final_roster" : "all_candidates",
      sourceCount: candidates.length,
    });
  }

  if (body.intent === "add_manual") {
    const playerFullName = body.playerFullName?.trim();
    const ageGroup = body.ageGroup?.trim() || cycle.ageGroup;
    const team = body.team?.trim() || "";
    if (!playerFullName) {
      return NextResponse.json({ error: "playerFullName is required" }, { status: 400 });
    }
    const payment = await prisma.allStarPayment.create({
      data: {
        organizationId: cycle.organizationId,
        ballotCycleId: cycle.id,
        candidateId: null,
        playerFullName,
        ageGroup,
        team,
        amountCents: ALL_STAR_FEE_CENTS,
      },
    });
    return NextResponse.json({ success: true, payment: serializePayment(payment) });
  }

  return NextResponse.json({ error: "Invalid intent" }, { status: 400 });
}

// ─── PATCH: update a single record, or bulk-reprice a whole roster ───────────
export async function PATCH(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const admin = await getAdminUserFromRequest(request);
  const body = (await request.json()) as {
    paymentId?: string;
    isPaid?: boolean;
    payerName?: string;
    notes?: string;
    amountCents?: number;
    playerFullName?: string;
    team?: string;
    // Bulk: update fee for every record in a roster
    rosterTag?: string;
    bulkAmountCents?: number;
  };

  // ── Bulk reprice ──────────────────────────────────────────────────────────
  if (!body.paymentId && body.rosterTag && body.bulkAmountCents !== undefined) {
    if (!Number.isInteger(body.bulkAmountCents) || body.bulkAmountCents <= 0) {
      return NextResponse.json({ error: "bulkAmountCents must be a positive integer" }, { status: 400 });
    }
    const result = await prisma.allStarPayment.updateMany({
      where: { rosterTag: body.rosterTag },
      data: { amountCents: body.bulkAmountCents },
    });
    return NextResponse.json({ success: true, updated: result.count });
  }

  // ── Per-record update ─────────────────────────────────────────────────────
  if (!body.paymentId) return NextResponse.json({ error: "paymentId is required" }, { status: 400 });

  const existing = await prisma.allStarPayment.findUnique({ where: { id: body.paymentId } });
  if (!existing) return NextResponse.json({ error: "Payment record not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.isPaid !== undefined) {
    data.isPaid = body.isPaid;
    data.paidAt = body.isPaid ? new Date() : null;
    data.markedPaidByAdminId = body.isPaid ? (admin?.id ?? null) : null;
  }
  if (body.payerName !== undefined) data.payerName = body.payerName.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes.trim() || null;
  if (body.amountCents !== undefined && Number.isInteger(body.amountCents) && body.amountCents > 0) {
    data.amountCents = body.amountCents;
  }
  if (body.playerFullName !== undefined && body.playerFullName.trim()) {
    data.playerFullName = body.playerFullName.trim();
  }
  if (body.team !== undefined) data.team = body.team.trim();

  const updated = await prisma.allStarPayment.update({ where: { id: body.paymentId }, data });
  return NextResponse.json({ success: true, payment: serializePayment(updated) });
}

// ─── DELETE: remove a payment record ─────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as { paymentId?: string };
  if (!body.paymentId) return NextResponse.json({ error: "paymentId is required" }, { status: 400 });

  const existing = await prisma.allStarPayment.findUnique({ where: { id: body.paymentId } });
  if (!existing) return NextResponse.json({ error: "Payment record not found" }, { status: 404 });

  await prisma.allStarPayment.delete({ where: { id: body.paymentId } });
  return NextResponse.json({ success: true });
}

// ─── Serializer ──────────────────────────────────────────────────────────────
function serializePayment(p: {
  id: string;
  organizationId: string;
  ballotCycleId: string;
  candidateId: string | null;
  playerFullName: string;
  ageGroup: string;
  team: string;
  payerName: string | null;
  paypalTxId: string | null;
  paypalTxDate: Date | null;
  paypalNote: string | null;
  amountCents: number;
  isPaid: boolean;
  paidAt: Date | null;
  markedPaidByAdminId: string | null;
  notes: string | null;
  rosterTag: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...p,
    paypalTxDate: p.paypalTxDate?.toISOString() ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
