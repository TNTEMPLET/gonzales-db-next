import { NextRequest, NextResponse } from "next/server";

import { assignJerseyNumbersForTeam } from "@/lib/admin/jerseyNumbers";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

/**
 * Reassigns jersey numbers for every player on one team. See
 * lib/admin/jerseyNumbers.ts for the ordering rule — this route is the
 * manual trigger; draft materialization calls the same function
 * automatically when a draft finishes.
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

  const result = await assignJerseyNumbersForTeam(prisma, teamId);
  if (!result) {
    return NextResponse.json({ error: "This team has no players yet" }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    assigned: result.assigned,
    unmatchedSizes: result.unmatchedSizes,
  });
}
