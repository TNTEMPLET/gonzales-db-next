import { NextRequest, NextResponse } from "next/server";

import { parseRequiredRatingsPerCoachInput } from "@/lib/allStar/ballotVoteRules";
import { ensureAllStarVaultAccess, ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { importCandidatesFromTeamsForCycle } from "@/lib/allStar/candidates";
import { resolveAllStarAgeGroupMetadata } from "@/lib/allStar/cycleSetupHelpers";
import { mapAllStarCycle, parseSeasonYear } from "@/lib/allStar/server";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { hasAdminRoleAtLeast } from "@/lib/auth/adminRoles";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import {
  getDefaultAllStarCutoffMonthDayForOrg,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

function forbidIfNotMaster() {
  return null;
}

function normalizeAgeBandFilter(value: unknown): string | "BOTH" | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "BOTH") return "BOTH";
  const match = normalized.match(/^(\d{1,2})U$/);
  if (match?.[1]) return `${Number.parseInt(match[1], 10)}U`;
  return null;
}

function requiresAgeBandFilterForCycle(organizationId: string, ageGroup: string) {
  return organizationId === "gonzales" && ageGroup.trim().toUpperCase().startsWith("12U");
}

function deriveAllStarAgeBandFromBirthDate(birthDate: Date | null, cutoffDate: Date | null) {
  if (!birthDate || !cutoffDate) return null;
  let age = cutoffDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = cutoffDate.getUTCMonth() - birthDate.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && cutoffDate.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }
  if (!Number.isInteger(age) || age < 4 || age > 18) return null;
  return `${age}U`;
}

async function backfillAllStarAgeBandsForCyclePublish(
  organizationId: "gonzales" | "ascension",
  seasonYear: number,
  ageGroup: string,
) {
  const configuredCutoff = await prisma.teamAllStarAgeCutoff.findUnique({
    where: {
      organizationId_seasonYear: {
        organizationId,
        seasonYear,
      },
    },
    select: { cutoffDate: true },
  });
  const defaultCutoff = (() => {
    const { month, day } = getDefaultAllStarCutoffMonthDayForOrg(organizationId);
    return new Date(Date.UTC(seasonYear, month - 1, day, 0, 0, 0, 0));
  })();
  const cutoffDate = configuredCutoff?.cutoffDate ?? defaultCutoff;

  const players = await prisma.teamPlayer.findMany({
    where: {
      team: {
        organizationId,
        seasonYear,
        ageGroup,
      },
    },
    select: { id: true, birthDate: true },
  });

  await Promise.all(
    players.map((player) =>
      prisma.teamPlayer.update({
        where: { id: player.id },
        data: {
          allStarAgeBand: deriveAllStarAgeBandFromBirthDate(
            player.birthDate,
            cutoffDate,
          ),
        },
      }),
    ),
  );
}

function getAutoCycleTitleForAgeBandPool(
  organizationId: string,
  ageGroup: string,
  ageBandFilter: string | "BOTH",
) {
  if (
    organizationId === "gonzales" &&
    ageGroup.trim().toUpperCase().startsWith("12U") &&
    ageBandFilter === "11U"
  ) {
    return "11U DYB";
  }
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
  const ensureCycleId = request.nextUrl.searchParams.get("ensureCycleId")?.trim() || null;

  const cycles = await prisma.allStarBallotCycle.findMany({
    where: {
      organizationId: org || undefined,
      seasonYear: seasonYear || undefined,
      ageGroup: ageGroup || undefined,
    },
    orderBy: [{ seasonYear: "desc" }, { ageGroup: "asc" }],
  });

  const mapped = cycles.map(mapAllStarCycle);
  let ensuredExtra = false;
  if (
    ensureCycleId &&
    org &&
    !mapped.some((row) => row.id === ensureCycleId)
  ) {
    const extra = await prisma.allStarBallotCycle.findFirst({
      where: { id: ensureCycleId, organizationId: org },
    });
    if (extra) {
      mapped.push(mapAllStarCycle(extra));
      ensuredExtra = true;
    } else if (process.env.NODE_ENV === "development") {
      console.warn("[all-star/cycles GET] ensureCycleId not found for org", {
        ensureCycleId,
        org,
        seasonYear,
      });
    }
  }

  if (process.env.NODE_ENV === "development" && ensureCycleId) {
    console.info("[all-star/cycles GET]", {
      org,
      seasonYear,
      ensureCycleId,
      baseCount: cycles.length,
      returnedCount: mapped.length,
      ensuredExtra,
    });
  }

  const canDelete = await canDeleteCycles(request);
  return NextResponse.json({
    data: mapped,
    permissions: { canDeleteCycles: canDelete },
  });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const body = (await request.json()) as {
    intent?: "setup_wizard" | "legacy";
    resumeExistingDraft?: boolean;
    organizationId?: string;
    seasonYear?: number;
    ageGroup?: string;
    allStarAgeGroupId?: string | null;
    allStarAgeGroupLabel?: string | null;
    title?: string;
    accessMode?: "INVITE_LIST" | "AGE_GROUP_COACHES";
    hasShowcase?: boolean;
    requiredRatingsPerCoach?: number;
    autoImportAgeBandFilter?: "11U" | "12U" | "BOTH";
  };
  const isSetupWizardIntent = body.intent === "setup_wizard";
  const parsedRequiredRatingsPerCoach =
    body.requiredRatingsPerCoach === undefined
      ? null
      : parseRequiredRatingsPerCoachInput(body.requiredRatingsPerCoach);
  if (body.requiredRatingsPerCoach !== undefined && parsedRequiredRatingsPerCoach === null) {
    return NextResponse.json(
      { error: "requiredRatingsPerCoach must be an integer between 1 and 50" },
      { status: 400 },
    );
  }

  const organizationId = resolveAdminTargetOrg(body.organizationId);
  const seasonYear = parseSeasonYear(String(body.seasonYear ?? ""));
  const ageGroup = body.ageGroup?.trim();
  if (!organizationId || !seasonYear || !ageGroup) {
    return NextResponse.json(
      { error: "organizationId, seasonYear, and ageGroup are required" },
      { status: 400 },
    );
  }
  const ageBandFilter = requiresAgeBandFilterForCycle(organizationId, ageGroup)
    ? normalizeAgeBandFilter(body.autoImportAgeBandFilter) || "BOTH"
    : "BOTH";
  const resolvedAllStarAgeGroup = resolveAllStarAgeGroupMetadata({
    organizationId,
    ageGroup,
    allStarAgeGroupId: body.allStarAgeGroupId,
    allStarAgeGroupLabel: body.allStarAgeGroupLabel,
    ageBandFilter,
  });
  const normalizedAllStarAgeGroupId = resolvedAllStarAgeGroup.id;
  const normalizedAllStarAgeGroupLabel = resolvedAllStarAgeGroup.label;

  const autoTitle = getAutoCycleTitleForAgeBandPool(organizationId, ageGroup, ageBandFilter);
  const normalizedTitle = (body.title?.trim() || autoTitle || "").trim() || null;
  const admin = await getAdminUserFromRequest(request);
  const existingCycle = await prisma.allStarBallotCycle.findFirst({
    where: {
      organizationId,
      seasonYear,
      ageGroup,
      allStarAgeGroupId: normalizedAllStarAgeGroupId,
      title: normalizedTitle,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingCycle) {
    const submissionCount = await prisma.allStarVoteSubmission.count({
      where: { ballotCycleId: existingCycle.id },
    });
    const hasVoteSubmissions = submissionCount > 0;

    if (isSetupWizardIntent) {
      if (!body.resumeExistingDraft) {
        return NextResponse.json(
          {
            error:
              "A ballot with these settings already exists. Choose a different title or resume the existing draft.",
            reusedExisting: true,
            hasVoteSubmissions,
            cycle: mapAllStarCycle(existingCycle),
          },
          { status: 409 },
        );
      }
      if (existingCycle.status !== "DRAFT" || hasVoteSubmissions) {
        return NextResponse.json(
          {
            error:
              "Only draft ballots without submitted votes can be resumed from setup.",
            reusedExisting: true,
            hasVoteSubmissions,
            cycle: mapAllStarCycle(existingCycle),
          },
          { status: 409 },
        );
      }

      const updated = await prisma.allStarBallotCycle.update({
        where: { id: existingCycle.id },
        data: {
          title: normalizedTitle,
          accessMode: body.accessMode || "AGE_GROUP_COACHES",
          allStarAgeGroupId: normalizedAllStarAgeGroupId,
          allStarAgeGroupLabel: normalizedAllStarAgeGroupLabel,
          hasShowcase:
            typeof body.hasShowcase === "boolean" ? body.hasShowcase : undefined,
          requiredRatingsPerCoach: parsedRequiredRatingsPerCoach ?? undefined,
        },
      });
      return NextResponse.json({
        success: true,
        cycle: mapAllStarCycle(updated),
        reusedExisting: true,
        resumedExistingDraft: true,
        hasVoteSubmissions,
        autoImport: { created: 0, skipped: 0, processed: 0, imported: false },
      });
    }

    const updated = await prisma.allStarBallotCycle.update({
      where: { id: existingCycle.id },
      data: {
        title: normalizedTitle,
        accessMode: body.accessMode || "AGE_GROUP_COACHES",
        allStarAgeGroupId: normalizedAllStarAgeGroupId,
        allStarAgeGroupLabel: normalizedAllStarAgeGroupLabel,
        hasShowcase:
          typeof body.hasShowcase === "boolean" ? body.hasShowcase : undefined,
        requiredRatingsPerCoach: parsedRequiredRatingsPerCoach ?? undefined,
      },
    });
    return NextResponse.json({
      success: true,
      cycle: mapAllStarCycle(updated),
      reusedExisting: true,
      hasVoteSubmissions,
      autoImport: { created: 0, skipped: 0, processed: 0, imported: false },
    });
  }
  if (
    requiresAgeBandFilterForCycle(organizationId, ageGroup) &&
    !normalizeAgeBandFilter(body.autoImportAgeBandFilter)
  ) {
    return NextResponse.json(
      { error: "Select All-Star age filter (11U, 12U, or BOTH) for 12U DYB cycle imports." },
      { status: 400 },
    );
  }

  const created = await prisma.allStarBallotCycle.create({
    data: {
      organizationId,
      seasonYear,
      ageGroup,
      title: normalizedTitle,
      allStarAgeGroupId: normalizedAllStarAgeGroupId,
      allStarAgeGroupLabel: normalizedAllStarAgeGroupLabel,
      accessMode: body.accessMode || "AGE_GROUP_COACHES",
      hasShowcase: typeof body.hasShowcase === "boolean" ? body.hasShowcase : true,
      requiredRatingsPerCoach: parsedRequiredRatingsPerCoach ?? undefined,
      createdByAdminId: admin?.id || null,
    },
  });
  if (
    created.organizationId === "gonzales" ||
    created.organizationId === "ascension"
  ) {
    // Ensure player age bands are present before immediate auto-import on create.
    await backfillAllStarAgeBandsForCyclePublish(
      created.organizationId,
      created.seasonYear,
      created.ageGroup,
    );
  }
  const autoImport = await importCandidatesFromTeamsForCycle(prisma, {
    id: created.id,
    organizationId: created.organizationId,
    seasonYear: created.seasonYear,
    ageGroup: created.ageGroup,
    allStarAgeGroupId: created.allStarAgeGroupId,
    allStarAgeGroupLabel: created.allStarAgeGroupLabel,
  }, ageBandFilter);

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
    requiredRatingsPerCoach?: number;
    title?: string | null;
    publishedAt?: string | null;
    closedAt?: string | null;
    activePhase?: "FIRST_TEAM" | "SECOND_TEAM";
    allStarAgeGroupId?: string | null;
    allStarAgeGroupLabel?: string | null;
  };

  if (!body.cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const existingCycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: body.cycleId },
    select: { status: true },
  });
  if (!existingCycle) {
    return NextResponse.json({ error: "Ballot cycle not found" }, { status: 404 });
  }

  const parsedRequiredRatingsPerCoach =
    body.requiredRatingsPerCoach === undefined
      ? null
      : parseRequiredRatingsPerCoachInput(body.requiredRatingsPerCoach);
  if (body.requiredRatingsPerCoach !== undefined && parsedRequiredRatingsPerCoach === null) {
    return NextResponse.json(
      { error: "requiredRatingsPerCoach must be an integer between 1 and 50" },
      { status: 400 },
    );
  }
  if (
    parsedRequiredRatingsPerCoach !== null &&
    (existingCycle.status === "CLOSED" || existingCycle.status === "ARCHIVED")
  ) {
    return NextResponse.json(
      { error: "Ratings per coach cannot be changed after the ballot is closed." },
      { status: 409 },
    );
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

  const effectivePublishedAt = parsedPublishedAt;
  const effectiveClosedAt =
    parsedClosedAt !== undefined
      ? parsedClosedAt
      : body.status === "CLOSED"
        ? new Date()
        : undefined;

  if (
    effectivePublishedAt !== undefined &&
    effectiveClosedAt !== undefined &&
    ((effectivePublishedAt === null) !== (effectiveClosedAt === null))
  ) {
    return NextResponse.json(
      { error: "Set both open and close times, or clear both." },
      { status: 400 },
    );
  }

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
      requiredRatingsPerCoach: parsedRequiredRatingsPerCoach ?? undefined,
      allStarAgeGroupId:
        body.allStarAgeGroupId === undefined
          ? undefined
          : body.allStarAgeGroupId?.trim() || null,
      allStarAgeGroupLabel:
        body.allStarAgeGroupLabel === undefined
          ? undefined
          : body.allStarAgeGroupLabel?.trim() || null,
      title: body.title === undefined ? undefined : body.title?.trim() || null,
      publishedAt: effectivePublishedAt,
      closedAt: effectiveClosedAt,
      activePhase: body.activePhase,
    },
  });

  if (
    body.status === "PUBLISHED" &&
    (updated.organizationId === "gonzales" ||
      updated.organizationId === "ascension")
  ) {
    await backfillAllStarAgeBandsForCyclePublish(
      updated.organizationId,
      updated.seasonYear,
      updated.ageGroup,
    );
  }

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
