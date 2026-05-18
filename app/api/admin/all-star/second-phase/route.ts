import { NextRequest, NextResponse } from "next/server";

import { parseRequiredRatingsPerCoachInput } from "@/lib/allStar/ballotVoteRules";
import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import {
  buildRunoffCycleTitle,
  buildSecondTeamCycleTitle,
  isRunoffCycleTitle,
  isSecondTeamCycleTitle,
} from "@/lib/allStar/cycleType";
import {
  computeVoteSummaryRows,
  getRunoffPoolCandidateIds,
  getSecondTeamAutoExclusionCandidateIds,
  getSecondTeamAutoExclusionCandidateIdsForCount,
} from "@/lib/allStar/voteSummary";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";

type GenerateBody = {
  cycleId?: string;
  action?: "generate";
  mode?: "remainder" | "runoff" | "leftover";
  poolSize?: number;
  keepTopVoteGetterCount?: number;
  requiredRatingsPerCoach?: number;
  firstTeamSize?: number;
  candidateIds?: string[];
  title?: string | null;
  isFinalVote?: boolean;
  teamTarget?: "FIRST_TEAM" | "SECOND_TEAM";
  playersNeeded?: number;
};

function parsePositiveInt(value: unknown, fieldName: string, max = 50) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: `${fieldName} must be an integer between 1 and ${max}` },
        { status: 400 },
      ),
    };
  }
  return { ok: true as const, value: parsed };
}

function normalizeOptionalTitle(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function normalizeCandidateIds(value: unknown) {
  if (!Array.isArray(value)) return null;
  const ids = value.map((entry) => String(entry || "").trim()).filter(Boolean);
  return Array.from(new Set(ids));
}

function pickActiveCandidatesById<T extends { id: string; isActive: boolean }>(
  ids: string[],
  candidates: Map<string, T>,
) {
  return ids.flatMap((id) => {
    const candidate = candidates.get(id);
    return candidate?.isActive ? [candidate] : [];
  });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as GenerateBody;
  if (!body.cycleId || body.action !== "generate") {
    return NextResponse.json({ error: "cycleId and action=generate are required" }, { status: 400 });
  }

  const mode = body.mode === "runoff" || body.mode === "leftover" ? body.mode : "remainder";

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: body.cycleId },
    include: { candidates: true },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  if (mode === "remainder") {
    if (isSecondTeamCycleTitle(cycle.title)) {
      return NextResponse.json(
        { error: "Selected cycle is already a second-team cycle" },
        { status: 400 },
      );
    }

    const secondTitle = normalizeOptionalTitle(body.title) || buildSecondTeamCycleTitle(cycle.title);
    const existingSecondTeam = await prisma.allStarBallotCycle.findFirst({
      where: {
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: cycle.ageGroup,
        title: secondTitle,
      },
      orderBy: { createdAt: "desc" },
    });
    if (existingSecondTeam) {
      return NextResponse.json({
        success: true,
        created: false,
        mode: "remainder" as const,
        secondCycleId: existingSecondTeam.id,
        message: "Second-team cycle already exists",
      });
    }

    const firstTeam = await computeVoteSummaryRows(prisma, cycle.id);
    if (!firstTeam) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
    const keepTopCount =
      body.keepTopVoteGetterCount === undefined
        ? null
        : parsePositiveInt(body.keepTopVoteGetterCount, "keepTopVoteGetterCount", 200);
    if (keepTopCount && !keepTopCount.ok) return keepTopCount.response;
    const autoExcludedIds = keepTopCount
      ? getSecondTeamAutoExclusionCandidateIdsForCount(firstTeam.rows, keepTopCount.value)
      : getSecondTeamAutoExclusionCandidateIds(firstTeam.rows);
    const explicitCandidateIds = normalizeCandidateIds(body.candidateIds);
    const candidateById = new Map(cycle.candidates.map((candidate) => [candidate.id, candidate]));
    const includedCandidates = explicitCandidateIds
      ? pickActiveCandidatesById(explicitCandidateIds, candidateById)
      : cycle.candidates.filter(
          (candidate) => candidate.isActive && !autoExcludedIds.has(candidate.id),
        );
    if (explicitCandidateIds && includedCandidates.length !== explicitCandidateIds.length) {
      return NextResponse.json(
        { error: "candidateIds must all belong to the selected cycle and be active" },
        { status: 400 },
      );
    }
    if (includedCandidates.length === 0) {
      return NextResponse.json(
        { error: "At least one candidate is required to generate a ballot" },
        { status: 400 },
      );
    }

    const firstCycleInvites = await prisma.allStarInvite.findMany({
      where: { ballotCycleId: cycle.id },
      orderBy: { createdAt: "desc" },
    });

    const admin = await getAdminUserFromRequest(request);
    const created = await prisma.$transaction(async (tx) => {
      const secondCycle = await tx.allStarBallotCycle.create({
        data: {
          organizationId: cycle.organizationId,
          seasonYear: cycle.seasonYear,
          ageGroup: cycle.ageGroup,
          title: secondTitle,
          hasShowcase: cycle.hasShowcase,
          status: "DRAFT",
          accessMode: cycle.accessMode,
          createdByAdminId: admin?.id || null,
        },
      });

      for (const candidate of includedCandidates) {
        await tx.allStarCandidate.create({
          data: {
            ballotCycleId: secondCycle.id,
            organizationId: candidate.organizationId,
            ageGroup: candidate.ageGroup,
            playerFullName: candidate.playerFullName,
            team: candidate.team,
            jerseyNumber: candidate.jerseyNumber,
            showcaseBibNumber: candidate.showcaseBibNumber,
            isActive: candidate.isActive,
          },
        });
      }

      for (const invite of firstCycleInvites) {
        await tx.allStarInvite.create({
          data: {
            ballotCycleId: secondCycle.id,
            tokenHash: null,
            inviteToken: null,
            organizationId: invite.organizationId,
            ageGroup: invite.ageGroup,
            invitedEmail: invite.invitedEmail,
            invitedUserId: invite.invitedUserId,
            createdByAdminId: admin?.id || null,
            revokedAt: invite.revokedAt,
            expiresAt: invite.expiresAt,
          },
        });
      }
      return secondCycle;
    });

    return NextResponse.json({
      success: true,
      created: true,
      mode: "remainder" as const,
      secondCycleId: created.id,
      includedCandidates: includedCandidates.length,
    });
  }

  // mode === "runoff" | "leftover"
  if (isRunoffCycleTitle(cycle.title)) {
    return NextResponse.json(
      { error: "Selected cycle is already a runoff ballot" },
      { status: 400 },
    );
  }

  const poolSizeResult = parsePositiveInt(body.poolSize, "poolSize", 200);
  if (!poolSizeResult.ok) return poolSizeResult.response;
  const poolSize = poolSizeResult.value;

  const parsedRatings = parseRequiredRatingsPerCoachInput(body.requiredRatingsPerCoach);
  if (parsedRatings === null) {
    return NextResponse.json(
      { error: "requiredRatingsPerCoach must be an integer between 1 and 50" },
      { status: 400 },
    );
  }

  const firstTeamSize =
    body.firstTeamSize === undefined ? parsedRatings : Number(body.firstTeamSize);
  if (!Number.isInteger(firstTeamSize) || firstTeamSize < 1 || firstTeamSize > 50) {
    return NextResponse.json(
      { error: "firstTeamSize must be an integer between 1 and 50 when provided" },
      { status: 400 },
    );
  }

  const playersNeeded =
    body.playersNeeded === undefined
      ? null
      : parsePositiveInt(body.playersNeeded, "playersNeeded", 50);
  if (playersNeeded && !playersNeeded.ok) return playersNeeded.response;
  const targetTeam =
    body.teamTarget === "FIRST_TEAM" || body.teamTarget === "SECOND_TEAM"
      ? body.teamTarget
      : null;

  const runoffTitle =
    normalizeOptionalTitle(body.title) ||
    (mode === "leftover"
      ? buildSecondTeamCycleTitle(cycle.title)
      : buildRunoffCycleTitle(cycle.title));
  const existingRunoff = await prisma.allStarBallotCycle.findFirst({
    where: {
      organizationId: cycle.organizationId,
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
      title: runoffTitle,
    },
    orderBy: { createdAt: "desc" },
  });
  if (existingRunoff) {
    return NextResponse.json({
      success: true,
      created: false,
      mode: "runoff" as const,
      secondCycleId: existingRunoff.id,
      message: "Runoff cycle already exists",
    });
  }

  const summary = await computeVoteSummaryRows(prisma, cycle.id);
  if (!summary) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  const explicitCandidateIds = normalizeCandidateIds(body.candidateIds);
  if (!explicitCandidateIds && summary.rows.length < poolSize) {
    return NextResponse.json(
      {
        error: `Not enough players with votes to fill the pool. Need at least ${poolSize} ranked players; found ${summary.rows.length}.`,
      },
      { status: 400 },
    );
  }

  const poolIds =
    explicitCandidateIds === null
      ? mode === "leftover"
        ? (() => {
            const keptIds = getSecondTeamAutoExclusionCandidateIdsForCount(summary.rows, poolSize);
            return new Set(
              cycle.candidates
                .filter((candidate) => candidate.isActive && !keptIds.has(candidate.id))
                .map((candidate) => candidate.id),
            );
          })()
        : getRunoffPoolCandidateIds(summary.rows, poolSize)
      : new Set(explicitCandidateIds);
  const candidateById = new Map(cycle.candidates.map((candidate) => [candidate.id, candidate]));
  const includedCandidates =
    explicitCandidateIds === null
      ? cycle.candidates.filter((candidate) => candidate.isActive && poolIds.has(candidate.id))
      : pickActiveCandidatesById(explicitCandidateIds, candidateById);
  if (explicitCandidateIds && includedCandidates.length !== explicitCandidateIds.length) {
    return NextResponse.json(
      { error: "candidateIds must all belong to the selected cycle and be active" },
      { status: 400 },
    );
  }
  const actualPoolSize = includedCandidates.length;
  if (actualPoolSize === 0) {
    return NextResponse.json(
      { error: "At least one candidate is required to generate a ballot" },
      { status: 400 },
    );
  }
  if (firstTeamSize > actualPoolSize) {
    return NextResponse.json(
      {
        error: `firstTeamSize (${firstTeamSize}) cannot exceed the runoff pool (${actualPoolSize} players, including ties at the cutoff).`,
      },
      { status: 400 },
    );
  }
  if (parsedRatings > actualPoolSize) {
    return NextResponse.json(
      {
        error: `requiredRatingsPerCoach (${parsedRatings}) cannot exceed the runoff pool (${actualPoolSize} players, including ties at the cutoff).`,
      },
      { status: 400 },
    );
  }

  const firstCycleInvites = await prisma.allStarInvite.findMany({
    where: { ballotCycleId: cycle.id },
    orderBy: { createdAt: "desc" },
  });

  const admin = await getAdminUserFromRequest(request);
  const created = await prisma.$transaction(async (tx) => {
    const secondCycle = await tx.allStarBallotCycle.create({
      data: {
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: cycle.ageGroup,
        allStarAgeGroupId: cycle.allStarAgeGroupId,
        allStarAgeGroupLabel: cycle.allStarAgeGroupLabel,
        title: runoffTitle,
        hasShowcase: cycle.hasShowcase,
        requiredRatingsPerCoach: parsedRatings,
        status: "DRAFT",
        accessMode: cycle.accessMode,
        createdByAdminId: admin?.id || null,
        parentBallotCycleId: cycle.id,
        runoffPoolSize: actualPoolSize,
        runoffFirstTeamSize: firstTeamSize,
        runoffIsFinalVote: body.isFinalVote === true,
        runoffTeamTarget: targetTeam,
        runoffPlayersNeeded: playersNeeded?.value ?? null,
      },
    });

    for (const candidate of includedCandidates) {
      await tx.allStarCandidate.create({
        data: {
          ballotCycleId: secondCycle.id,
          organizationId: candidate.organizationId,
          ageGroup: candidate.ageGroup,
          playerFullName: candidate.playerFullName,
          team: candidate.team,
          jerseyNumber: candidate.jerseyNumber,
          showcaseBibNumber: candidate.showcaseBibNumber,
          isActive: candidate.isActive,
        },
      });
    }

    for (const invite of firstCycleInvites) {
      await tx.allStarInvite.create({
        data: {
          ballotCycleId: secondCycle.id,
          tokenHash: null,
          inviteToken: null,
          organizationId: invite.organizationId,
          ageGroup: invite.ageGroup,
          invitedEmail: invite.invitedEmail,
          invitedUserId: invite.invitedUserId,
          createdByAdminId: admin?.id || null,
          revokedAt: invite.revokedAt,
          expiresAt: invite.expiresAt,
        },
      });
    }
    return secondCycle;
  });

  return NextResponse.json({
    success: true,
    created: true,
    mode,
    secondCycleId: created.id,
    includedCandidates: actualPoolSize,
    runoffPoolSize: actualPoolSize,
    runoffFirstTeamSize: firstTeamSize,
    requiredRatingsPerCoach: parsedRatings,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as {
    cycleId?: string;
    candidateId?: string;
    mode?: "include" | "exclude" | "clear";
  };
  if (!body.cycleId || !body.candidateId || !body.mode) {
    return NextResponse.json(
      { error: "cycleId, candidateId, and mode are required" },
      { status: 400 },
    );
  }
  const admin = await getAdminUserFromRequest(request);
  const update =
    body.mode === "clear"
      ? {
          excludedFromSecondPhase: false,
          secondPhaseOverrideReason: null,
          secondPhaseOverrideAt: null,
          secondPhaseOverrideByAdminId: null,
        }
      : body.mode === "include"
        ? {
            excludedFromSecondPhase: false,
            secondPhaseOverrideReason: "INCLUDE_OVERRIDE",
            secondPhaseOverrideAt: new Date(),
            secondPhaseOverrideByAdminId: admin?.id || null,
          }
        : {
            excludedFromSecondPhase: true,
            secondPhaseOverrideReason: "EXCLUDE_OVERRIDE",
            secondPhaseOverrideAt: new Date(),
            secondPhaseOverrideByAdminId: admin?.id || null,
          };

  const existing = await prisma.allStarCandidate.findUnique({
    where: { id: body.candidateId },
    select: { ballotCycleId: true },
  });
  if (!existing || existing.ballotCycleId !== body.cycleId) {
    return NextResponse.json({ error: "Candidate does not belong to cycle" }, { status: 400 });
  }
  await prisma.allStarCandidate.update({
    where: { id: body.candidateId },
    data: update,
  });
  return NextResponse.json({ success: true });
}
