import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { sortPlayersBySize } from "@/lib/admin/jerseySizes";

/**
 * Reassigns jersey numbers for every player on one team, starting at 1,
 * ordered smallest jersey size to largest (the league's usual convention),
 * tie-broken by last name. This replaces any existing numbers on the team —
 * it's a full renumber, not a fill-in-the-blanks pass.
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json().catch(() => ({}))) as { teamId?: string };
  const teamId = body.teamId?.trim();
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, organizationId: true },
  });
  if (!team || team.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const players = await prisma.teamPlayer.findMany({
    where: { teamId },
    select: { id: true, fullName: true, lastName: true, jerseySize: true },
  });
  if (players.length === 0) {
    return NextResponse.json({ error: "This team has no players yet" }, { status: 400 });
  }

  const { sorted, unmatched } = sortPlayersBySize(players);

  await prisma.$transaction(
    sorted.map((player, index) =>
      prisma.teamPlayer.update({
        where: { id: player.id },
        data: { jerseyNumber: String(index + 1) },
      }),
    ),
  );

  return NextResponse.json({
    success: true,
    assigned: sorted.length,
    unmatchedSizeNames: unmatched,
  });
}
