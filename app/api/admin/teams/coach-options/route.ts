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
  // Global identity: RegisteredUser has no organizationId/isCoach/ageGroup/assignedTeam.
  // Coaches for the org are those with an OrgProfile row where isCoach=true.
  const profiles = await (prisma as any).registeredUserOrgProfile.findMany({
    where: {
      organizationId: targetOrg,
      isCoach: true,
      registeredUser: { isBlocked: false },
    },
    include: {
      registeredUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          name: true,
          contactPhone: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  const coaches = profiles.map((p: any) => ({
    ...p.registeredUser,
    ageGroup: p.ageGroup ?? null,
    assignedTeam: p.assignedTeam ?? null,
  }));

  // Stable sort for the UI
  coaches.sort((a: any, b: any) =>
    (a.lastName || "").localeCompare(b.lastName || "") ||
    (a.firstName || "").localeCompare(b.firstName || "") ||
    (a.email || "").localeCompare(b.email || "")
  );

  return NextResponse.json({ data: coaches });
}
