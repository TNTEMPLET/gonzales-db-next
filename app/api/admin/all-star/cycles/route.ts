import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess, ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { importCandidatesFromTeamsForCycle } from "@/lib/allStar/candidates";
import { mapAllStarCycle, parseSeasonYear } from "@/lib/allStar/server";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { hasAdminRoleAtLeast } from "@/lib/auth/adminRoles";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

function forbidIfNotMaster() {
  return null;
}

async function canDeleteCycles(request: NextRequest) {
  const admin = await getAdminUserFromRequest(request);
  if (!admin) return false;
  const orgId = resolveAuthOrganizationId(request);
  const effectiveRole = await getEffectiveAdminRoleForOrg(
    admin.id,
    admin.isMaster,
    orgId,
  );
  if (effectiveRole && hasAdminRoleAtLeast(effectiveRole, "ADMIN")) {
    return true;
  }

  const linkedRegisteredUsers = await prisma.registeredUser.findMany({
    where: {
      email: { equals: admin.email, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (linkedRegisteredUsers.length === 0) return false;

  const fullAccess = await prisma.allStarVaultAccess.findFirst({
    where: {
      registeredUserId: { in: linkedRegisteredUsers.map((user) => user.id) },
      organizationId: orgId,
      role: "FULL_ACCESS",
    },
    select: { id: true },
  });
  return !!fullAccess;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const org = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const seasonYear = parseSeasonYear(request.nextUrl.searchParams.get("seasonYear"));
  const ageGroup = request.nextUrl.searchParams.get("ageGroup")?.trim() || null;

  const cycles = await prisma.allStarBallotCycle.findMany({
    where: {
      organizationId: org || undefined,
      seasonYear: seasonYear || undefined,
      ageGroup: ageGroup || undefined,
    },
    orderBy: [{ seasonYear: "desc" }, { ageGroup: "asc" }],
  });

  const canDelete = await canDeleteCycles(request);
  return NextResponse.json({
    data: cycles.map(mapAllStarCycle),
    permissions: { canDeleteCycles: canDelete },
  });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const body = (await request.json()) as {
    organizationId?: string;
    seasonYear?: number;
    ageGroup?: string;
    title?: string;
    accessMode?: "INVITE_LIST" | "AGE_GROUP_COACHES";
    hasShowcase?: boolean;
  };

  const organizationId = resolveAdminTargetOrg(body.organizationId);
  const seasonYear = parseSeasonYear(String(body.seasonYear ?? ""));
  const ageGroup = body.ageGroup?.trim();
  if (!organizationId || !seasonYear || !ageGroup) {
    return NextResponse.json(
      { error: "organizationId, seasonYear, and ageGroup are required" },
      { status: 400 },
    );
  }

  const normalizedTitle = body.title?.trim() || null;
  const admin = await getAdminUserFromRequest(request);
  const existingCycle = await prisma.allStarBallotCycle.findFirst({
    where: {
      organizationId,
      seasonYear,
      ageGroup,
      title: normalizedTitle,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingCycle) {
    const updated = await prisma.allStarBallotCycle.update({
      where: { id: existingCycle.id },
      data: {
        title: body.title?.trim() || null,
        accessMode: body.accessMode || "AGE_GROUP_COACHES",
        hasShowcase:
          typeof body.hasShowcase === "boolean" ? body.hasShowcase : undefined,
      },
    });
    return NextResponse.json({
      success: true,
      cycle: mapAllStarCycle(updated),
      autoImport: { created: 0, skipped: 0, processed: 0, imported: false },
    });
  }

  const created = await prisma.allStarBallotCycle.create({
    data: {
      organizationId,
      seasonYear,
      ageGroup,
      title: body.title?.trim() || null,
      accessMode: body.accessMode || "AGE_GROUP_COACHES",
      hasShowcase: typeof body.hasShowcase === "boolean" ? body.hasShowcase : true,
      createdByAdminId: admin?.id || null,
    },
  });
  const autoImport = await importCandidatesFromTeamsForCycle(prisma, {
    id: created.id,
    organizationId: created.organizationId,
    seasonYear: created.seasonYear,
    ageGroup: created.ageGroup,
  });

  return NextResponse.json({
    success: true,
    cycle: mapAllStarCycle(created),
    autoImport: { ...autoImport, imported: true },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const body = (await request.json()) as {
    cycleId?: string;
    status?: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
    accessMode?: "INVITE_LIST" | "AGE_GROUP_COACHES";
    hasShowcase?: boolean;
    title?: string | null;
    publishedAt?: string | null;
    closedAt?: string | null;
    activePhase?: "FIRST_TEAM" | "SECOND_TEAM";
  };

  if (!body.cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  let parsedPublishedAt: Date | undefined | null = undefined;
  if (body.publishedAt !== undefined) {
    if (body.publishedAt === null || body.publishedAt === "") {
      parsedPublishedAt = null;
    } else {
      const value = new Date(body.publishedAt);
      if (Number.isNaN(value.getTime())) {
        return NextResponse.json(
          { error: "publishedAt must be a valid datetime" },
          { status: 400 },
        );
      }
      parsedPublishedAt = value;
    }
  }

  let parsedClosedAt: Date | undefined | null = undefined;
  if (body.closedAt !== undefined) {
    if (body.closedAt === null || body.closedAt === "") {
      parsedClosedAt = null;
    } else {
      const value = new Date(body.closedAt);
      if (Number.isNaN(value.getTime())) {
        return NextResponse.json(
          { error: "closedAt must be a valid datetime" },
          { status: 400 },
        );
      }
      parsedClosedAt = value;
    }
  }

  const effectivePublishedAt =
    parsedPublishedAt !== undefined
      ? parsedPublishedAt
      : body.status === "PUBLISHED"
        ? new Date()
        : undefined;
  const effectiveClosedAt =
    parsedClosedAt !== undefined
      ? parsedClosedAt
      : body.status === "CLOSED"
        ? new Date()
        : undefined;

  if (
    effectivePublishedAt instanceof Date &&
    effectiveClosedAt instanceof Date &&
    effectiveClosedAt <= effectivePublishedAt
  ) {
    return NextResponse.json(
      { error: "closedAt must be later than publishedAt" },
      { status: 400 },
    );
  }

  const updated = await prisma.allStarBallotCycle.update({
    where: { id: body.cycleId },
    data: {
      status: body.status,
      accessMode: body.accessMode,
      hasShowcase: body.hasShowcase,
      title: body.title === undefined ? undefined : body.title?.trim() || null,
      publishedAt: effectivePublishedAt,
      closedAt: effectiveClosedAt,
      activePhase: body.activePhase,
    },
  });

  return NextResponse.json({ success: true, cycle: mapAllStarCycle(updated) });
}

export async function DELETE(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const canDelete = await canDeleteCycles(request);
  if (!canDelete) {
    return NextResponse.json(
      { error: "Only Full Access users can delete cycles" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { cycleId?: string };
  if (!body.cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  await prisma.allStarBallotCycle.delete({ where: { id: body.cycleId } });
  return NextResponse.json({ success: true });
}
