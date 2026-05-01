import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const orgParam = request.nextUrl.searchParams.get("org")?.trim();
  if (!orgParam) {
    return NextResponse.json({ error: "org is required" }, { status: 400 });
  }
  const targetOrg = resolveAdminTargetOrg(orgParam);
  const teamId = request.nextUrl.searchParams.get("teamId")?.trim();
  if (teamId) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, organizationId: true },
    });
    if (!team || team.organizationId !== targetOrg) {
      return NextResponse.json({ error: "Team not found for target org" }, { status: 404 });
    }
  }
  const coaches = await prisma.registeredUser.findMany({
    where: {
      organizationId: targetOrg,
      isCoach: true,
      isBlocked: false,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      name: true,
      ageGroup: true,
      assignedTeam: true,
      contactPhone: true,
    },
  });

  return NextResponse.json({ data: coaches });
}
