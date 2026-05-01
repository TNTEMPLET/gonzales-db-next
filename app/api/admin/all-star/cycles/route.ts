import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { mapAllStarCycle, parseContentOrg, parseSeasonYear } from "@/lib/allStar/server";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { isMasterDeployment } from "@/lib/siteConfig";

function forbidIfNotMaster() {
  if (!isMasterDeployment()) {
    return NextResponse.json(
      { error: "All-Star Vault is only managed from master deployment" },
      { status: 403 },
    );
  }
  return null;
}

async function canDeleteCycles(request: NextRequest) {
  const admin = await getAdminUserFromRequest(request);
  if (!admin) return false;
  if (hasAdminRoleAtLeast(toAdminRole(admin.role, admin.isMaster), "ADMIN")) {
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
      role: "FULL_ACCESS",
    },
    select: { id: true },
  });
  return !!fullAccess;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const org = parseContentOrg(request.nextUrl.searchParams.get("org"));
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
  };

  const organizationId = parseContentOrg(body.organizationId);
  const seasonYear = parseSeasonYear(String(body.seasonYear ?? ""));
  const ageGroup = body.ageGroup?.trim();
  if (!organizationId || !seasonYear || !ageGroup) {
    return NextResponse.json(
      { error: "organizationId, seasonYear, and ageGroup are required" },
      { status: 400 },
    );
  }

  const admin = await getAdminUserFromRequest(request);
  const created = await prisma.allStarBallotCycle.upsert({
    where: {
      organizationId_seasonYear_ageGroup: { organizationId, seasonYear, ageGroup },
    },
    create: {
      organizationId,
      seasonYear,
      ageGroup,
      title: body.title?.trim() || null,
      accessMode: body.accessMode || "AGE_GROUP_COACHES",
      createdByAdminId: admin?.id || null,
    },
    update: {
      title: body.title?.trim() || null,
      accessMode: body.accessMode || "AGE_GROUP_COACHES",
    },
  });

  return NextResponse.json({ success: true, cycle: mapAllStarCycle(created) });
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
    title?: string | null;
    publishedAt?: string | null;
    closedAt?: string | null;
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
      title: body.title === undefined ? undefined : body.title?.trim() || null,
      publishedAt: effectivePublishedAt,
      closedAt: effectiveClosedAt,
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
