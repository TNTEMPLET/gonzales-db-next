import { NextRequest, NextResponse } from "next/server";

import { validateRosterPlayers, type RosterPlayerInput } from "@/lib/tournament-rosters/csv";
import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import prisma from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

type PatchBody = {
  action?: "approve" | "reject" | "reopen";
  rejectionReason?: string;
  players?: RosterPlayerInput[];
};

function routeError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : String(err || fallback);
  return NextResponse.json({ error: message || fallback }, { status: 500 });
}

export async function PATCH(request: NextRequest, ctx: RouteParams) {
  try {
    const auth = await ensureTournamentBracketsMaster(request);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
    const { id } = await ctx.params;
    const body = (await request.json()) as PatchBody;
    const existing = await prisma.tournamentRosterSubmission.findUnique({ where: { id }, include: { players: true } });
    if (!existing) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.action === "approve") {
      data.status = "APPROVED";
      data.reviewedAt = new Date();
      data.reviewedByAdminId = auth.adminUserId;
      data.rejectionReason = null;
    } else if (body.action === "reject") {
      data.status = "REJECTED";
      data.reviewedAt = new Date();
      data.reviewedByAdminId = auth.adminUserId;
      data.rejectionReason = body.rejectionReason?.trim() || null;
    } else if (body.action === "reopen") {
      data.status = "PENDING";
      data.reviewedAt = null;
      data.reviewedByAdminId = null;
      data.rejectionReason = null;
    }

    if (body.players) {
      const validation = validateRosterPlayers(body.players);
      if (validation.errors.length) return NextResponse.json({ errors: validation.errors }, { status: 400 });
      await prisma.tournamentRosterSubmissionPlayer.deleteMany({ where: { submissionId: id } });
      await prisma.tournamentRosterSubmissionPlayer.createMany({
        data: validation.players.map((player, idx) => ({
          submissionId: id,
          rowNumber: idx + 1,
          firstName: player.firstName,
          lastName: player.lastName,
          jerseyNumber: player.jerseyNumber,
        })),
      });
    }

    const submission = await prisma.tournamentRosterSubmission.update({
      where: { id },
      data,
      include: { players: { orderBy: { rowNumber: "asc" } }, link: true },
    });
    return NextResponse.json({ data: submission });
  } catch (err: unknown) {
    return routeError(err, "Failed to review roster submission");
  }
}
