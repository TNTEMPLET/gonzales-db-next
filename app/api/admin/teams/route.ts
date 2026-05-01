import { NextRequest, NextResponse } from "next/server";

import { parseSeasonYear } from "@/lib/allStar/server";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
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

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const seasonYear = parseSeasonYear(request.nextUrl.searchParams.get("seasonYear"));
  const ageGroup = request.nextUrl.searchParams.get("ageGroup")?.trim() || null;
  const teamName = request.nextUrl.searchParams.get("teamName")?.trim() || null;

  const teams = await prisma.team.findMany({
    where: {
      organizationId: targetOrg,
      seasonYear: seasonYear || undefined,
      ageGroup: ageGroup || undefined,
      teamName: teamName || undefined,
    },
    orderBy: [{ seasonYear: "desc" }, { ageGroup: "asc" }, { teamName: "asc" }],
    include: {
      coachAssignments: {
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
      },
      _count: {
        select: { players: true, coachAssignments: true },
      },
    },
  });

  return NextResponse.json({ data: teams });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const admin = await getAdminUserFromRequest(request);
  const body = (await request.json()) as {
    seasonYear?: number;
    ageGroup?: string;
    teamName?: string;
    contactNotes?: string | null;
    practicePlan?: string | null;
  };

  const seasonYear = parseSeasonYear(String(body.seasonYear ?? ""));
  const ageGroup = body.ageGroup?.trim() || "";
  const teamName = body.teamName?.trim() || "";
  if (!seasonYear || !ageGroup || !teamName) {
    return NextResponse.json(
      { error: "seasonYear, ageGroup, and teamName are required" },
      { status: 400 },
    );
  }

  const created = await prisma.team.upsert({
    where: {
      organizationId_seasonYear_ageGroup_teamName: {
        organizationId: targetOrg,
        seasonYear,
        ageGroup,
        teamName,
      },
    },
    create: {
      organizationId: targetOrg,
      seasonYear,
      ageGroup,
      teamName,
      contactNotes: body.contactNotes?.trim() || null,
      practicePlan: body.practicePlan?.trim() || null,
      createdByAdminId: admin?.id || null,
    },
    update: {
      contactNotes: body.contactNotes?.trim() || null,
      practicePlan: body.practicePlan?.trim() || null,
    },
  });

  return NextResponse.json({ success: true, team: created });
}

export async function PATCH(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json()) as {
    teamId?: string;
    seasonYear?: number;
    ageGroup?: string | null;
    teamName?: string | null;
    contactNotes?: string | null;
    practicePlan?: string | null;
  };
  if (!body.teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const existing = await prisma.team.findUnique({
    where: { id: body.teamId },
    select: {
      id: true,
      organizationId: true,
      seasonYear: true,
      ageGroup: true,
      teamName: true,
    },
  });
  if (!existing || existing.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const nextSeasonYear =
    body.seasonYear !== undefined
      ? parseSeasonYear(String(body.seasonYear ?? ""))
      : undefined;
  if (body.seasonYear !== undefined && !nextSeasonYear) {
    return NextResponse.json({ error: "Invalid seasonYear" }, { status: 400 });
  }

  const updated = await prisma.team.update({
    where: { id: existing.id },
    data: {
      seasonYear: nextSeasonYear || undefined,
      ageGroup: body.ageGroup === undefined ? undefined : body.ageGroup?.trim() || undefined,
      teamName: body.teamName === undefined ? undefined : body.teamName?.trim() || undefined,
      contactNotes:
        body.contactNotes === undefined ? undefined : body.contactNotes?.trim() || null,
      practicePlan:
        body.practicePlan === undefined ? undefined : body.practicePlan?.trim() || null,
    },
  });

  return NextResponse.json({ success: true, team: updated });
}

export async function DELETE(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json()) as { teamId?: string };
  if (!body.teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const existing = await prisma.team.findUnique({
    where: { id: body.teamId },
    select: { id: true, organizationId: true },
  });
  if (!existing || existing.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  await prisma.team.delete({ where: { id: existing.id } });
  return NextResponse.json({ success: true });
}
