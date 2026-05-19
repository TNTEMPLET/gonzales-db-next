import type { AllStarAuditAction, Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

import { canRevertAllStarAuditAction } from "@/lib/allStar/auditLogLabels";
import { resequenceCandidateBibNumbers } from "@/lib/allStar/candidates";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";

export { canRevertAllStarAuditAction, formatAllStarAuditActionLabel } from "@/lib/allStar/auditLogLabels";

export type AllStarAuditLogDto = {
  id: string;
  organizationId: string;
  ballotCycleId: string | null;
  entityType: string;
  entityId: string | null;
  action: AllStarAuditAction;
  summary: string;
  actorAdminId: string | null;
  actorEmail: string;
  sourcePath: string | null;
  createdAt: string;
  revertedAt: string | null;
  revertedByAdminId: string | null;
  canRevert: boolean;
};

export async function ensureMasterAllStarAuditAccess(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return { ok: false as const, status: 401, message: "Unauthorized" };
  }
  if (!adminUser.isMaster) {
    return { ok: false as const, status: 403, message: "Master Admin only" };
  }
  return { ok: true as const, status: 200, adminUser };
}

export async function recordAllStarAuditLog(params: {
  organizationId: string;
  ballotCycleId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: AllStarAuditAction;
  summary: string;
  beforeState?: Prisma.InputJsonValue | null;
  afterState?: Prisma.InputJsonValue | null;
  request: NextRequest;
}) {
  const admin = await getAdminUserFromRequest(params.request);
  const sourcePath =
    params.request.headers.get("referer") || params.request.nextUrl.pathname || null;

  return prisma.allStarAuditLog.create({
    data: {
      organizationId: params.organizationId,
      ballotCycleId: params.ballotCycleId ?? null,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      action: params.action,
      summary: params.summary,
      beforeState: params.beforeState ?? undefined,
      afterState: params.afterState ?? undefined,
      actorAdminId: admin?.id ?? null,
      actorEmail: admin?.email ?? "unknown",
      sourcePath,
    },
  });
}

function mapAuditLogRow(log: {
  id: string;
  organizationId: string;
  ballotCycleId: string | null;
  entityType: string;
  entityId: string | null;
  action: AllStarAuditAction;
  summary: string;
  actorAdminId: string | null;
  actorEmail: string;
  sourcePath: string | null;
  createdAt: Date;
  revertedAt: Date | null;
  revertedByAdminId: string | null;
}): AllStarAuditLogDto {
  return {
    id: log.id,
    organizationId: log.organizationId,
    ballotCycleId: log.ballotCycleId,
    entityType: log.entityType,
    entityId: log.entityId,
    action: log.action,
    summary: log.summary,
    actorAdminId: log.actorAdminId,
    actorEmail: log.actorEmail,
    sourcePath: log.sourcePath,
    createdAt: log.createdAt.toISOString(),
    revertedAt: log.revertedAt?.toISOString() ?? null,
    revertedByAdminId: log.revertedByAdminId,
    canRevert: !log.revertedAt && canRevertAllStarAuditAction(log.action),
  };
}

export async function listAllStarAuditLogs(params: {
  organizationId: string;
  ballotCycleId?: string | null;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.AllStarAuditLogWhereInput = {
    organizationId: params.organizationId,
    ...(params.ballotCycleId ? { ballotCycleId: params.ballotCycleId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.allStarAuditLog.count({ where }),
    prisma.allStarAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);
  return {
    data: rows.map(mapAuditLogRow),
    meta: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    },
  };
}

type FinalRosterSnapshot = {
  finalRosterOverride: "SELECTED" | "REMOVED" | null;
  finalRosterOverrideReason: string | null;
  finalRosterOverrideAt: string | null;
  finalRosterOverrideByAdminId: string | null;
};

type CandidateSnapshot = {
  id: string;
  ballotCycleId: string;
  organizationId: string;
  ageGroup: string;
  playerFullName: string;
  team: string;
  jerseyNumber: string;
  showcaseBibNumber: string | null;
  isActive: boolean;
  excludedFromSecondPhase: boolean;
  secondPhaseOverrideReason: string | null;
  secondPhaseOverrideAt: string | null;
  secondPhaseOverrideByAdminId: string | null;
  finalRosterOverride: "SELECTED" | "REMOVED" | null;
  finalRosterOverrideReason: string | null;
  finalRosterOverrideAt: string | null;
  finalRosterOverrideByAdminId: string | null;
};

type CycleSnapshot = {
  status?: string;
  accessMode?: string;
  hasShowcase?: boolean;
  requiredRatingsPerCoach?: number;
  title?: string | null;
  publishedAt?: string | null;
  closedAt?: string | null;
  activePhase?: string;
  allStarAgeGroupId?: string | null;
  allStarAgeGroupLabel?: string | null;
  ballotLinkToken?: string | null;
  ballotLinkTokenHash?: string | null;
};

type VoteSubmissionSnapshot = {
  submission: {
    id: string;
    ballotCycleId: string;
    coachUserId: string;
    phase: string;
    organizationId: string;
    ageGroup: string;
    submittedAt: string;
  };
  voteItems: Array<{
    candidateId: string;
    rating: number;
  }>;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function applyAllStarAuditRevert(
  tx: Prisma.TransactionClient,
  log: {
    id: string;
    action: AllStarAuditAction;
    entityId: string | null;
    beforeState: unknown;
  },
) {
  const before = asObject(log.beforeState);

  switch (log.action) {
    case "FINAL_ROSTER_OVERRIDE": {
      const candidateId = log.entityId;
      if (!candidateId || !before) throw new Error("Missing revert data for final roster");
      const snap = before as FinalRosterSnapshot;
      await tx.allStarCandidate.update({
        where: { id: candidateId },
        data: {
          finalRosterOverride: snap.finalRosterOverride,
          finalRosterOverrideReason: snap.finalRosterOverrideReason,
          finalRosterOverrideAt: snap.finalRosterOverrideAt
            ? new Date(snap.finalRosterOverrideAt)
            : null,
          finalRosterOverrideByAdminId: snap.finalRosterOverrideByAdminId,
        },
      });
      return;
    }
    case "SECOND_PHASE_OVERRIDE": {
      const candidateId = log.entityId;
      if (!candidateId || !before) throw new Error("Missing revert data for second phase");
      await tx.allStarCandidate.update({
        where: { id: candidateId },
        data: {
          excludedFromSecondPhase: Boolean(before.excludedFromSecondPhase),
          secondPhaseOverrideReason:
            typeof before.secondPhaseOverrideReason === "string"
              ? before.secondPhaseOverrideReason
              : null,
          secondPhaseOverrideAt:
            typeof before.secondPhaseOverrideAt === "string"
              ? new Date(before.secondPhaseOverrideAt)
              : null,
          secondPhaseOverrideByAdminId:
            typeof before.secondPhaseOverrideByAdminId === "string"
              ? before.secondPhaseOverrideByAdminId
              : null,
        },
      });
      return;
    }
    case "CANDIDATE_CREATED": {
      const candidateId = log.entityId;
      if (!candidateId) throw new Error("Missing candidate id");
      const cycleId = typeof before?.ballotCycleId === "string" ? before.ballotCycleId : null;
      await tx.allStarCandidate.delete({ where: { id: candidateId } });
      if (cycleId) await resequenceCandidateBibNumbers(tx, cycleId);
      return;
    }
    case "CANDIDATE_DELETED": {
      if (!before) throw new Error("Missing candidate snapshot");
      const snap = before as CandidateSnapshot;
      await tx.allStarCandidate.create({
        data: {
          id: snap.id,
          ballotCycleId: snap.ballotCycleId,
          organizationId: snap.organizationId,
          ageGroup: snap.ageGroup,
          playerFullName: snap.playerFullName,
          team: snap.team,
          jerseyNumber: snap.jerseyNumber,
          showcaseBibNumber: snap.showcaseBibNumber,
          isActive: snap.isActive,
          excludedFromSecondPhase: snap.excludedFromSecondPhase,
          secondPhaseOverrideReason: snap.secondPhaseOverrideReason,
          secondPhaseOverrideAt: snap.secondPhaseOverrideAt
            ? new Date(snap.secondPhaseOverrideAt)
            : null,
          secondPhaseOverrideByAdminId: snap.secondPhaseOverrideByAdminId,
          finalRosterOverride: snap.finalRosterOverride,
          finalRosterOverrideReason: snap.finalRosterOverrideReason,
          finalRosterOverrideAt: snap.finalRosterOverrideAt
            ? new Date(snap.finalRosterOverrideAt)
            : null,
          finalRosterOverrideByAdminId: snap.finalRosterOverrideByAdminId,
        },
      });
      await resequenceCandidateBibNumbers(tx, snap.ballotCycleId);
      return;
    }
    case "CANDIDATE_UPDATED": {
      const rows = before?.candidates;
      if (!Array.isArray(rows)) throw new Error("Missing candidate bulk snapshot");
      for (const row of rows) {
        const snap = row as CandidateSnapshot;
        await tx.allStarCandidate.update({
          where: { id: snap.id },
          data: {
            team: snap.team,
            jerseyNumber: snap.jerseyNumber,
            isActive: snap.isActive,
            excludedFromSecondPhase: snap.excludedFromSecondPhase,
            secondPhaseOverrideReason: snap.secondPhaseOverrideReason,
            secondPhaseOverrideAt: snap.secondPhaseOverrideAt
              ? new Date(snap.secondPhaseOverrideAt)
              : null,
            secondPhaseOverrideByAdminId: snap.secondPhaseOverrideByAdminId,
          },
        });
      }
      return;
    }
    case "CYCLE_CREATED": {
      const cycleId = log.entityId;
      if (!cycleId) throw new Error("Missing cycle id");
      await tx.allStarBallotCycle.delete({ where: { id: cycleId } });
      return;
    }
    case "CYCLE_UPDATED": {
      const cycleId = log.entityId;
      if (!cycleId || !before) throw new Error("Missing cycle snapshot");
      const snap = before as CycleSnapshot;
      await tx.allStarBallotCycle.update({
        where: { id: cycleId },
        data: {
          status: snap.status as never | undefined,
          accessMode: snap.accessMode as never | undefined,
          hasShowcase: snap.hasShowcase,
          requiredRatingsPerCoach: snap.requiredRatingsPerCoach,
          title: snap.title,
          publishedAt:
            snap.publishedAt === undefined
              ? undefined
              : snap.publishedAt
                ? new Date(snap.publishedAt)
                : null,
          closedAt:
            snap.closedAt === undefined
              ? undefined
              : snap.closedAt
                ? new Date(snap.closedAt)
                : null,
          activePhase: snap.activePhase as never | undefined,
          allStarAgeGroupId: snap.allStarAgeGroupId,
          allStarAgeGroupLabel: snap.allStarAgeGroupLabel,
        },
      });
      return;
    }
    case "INVITE_REVOKED":
    case "INVITE_REENABLED": {
      const inviteId = log.entityId;
      if (!inviteId || !before) throw new Error("Missing invite snapshot");
      await tx.allStarInvite.update({
        where: { id: inviteId },
        data: {
          revokedAt:
            typeof before.revokedAt === "string" ? new Date(before.revokedAt) : null,
        },
      });
      return;
    }
    case "VAULT_ACCESS_UPSERT": {
      if (!before) throw new Error("Missing vault access snapshot");
      const registeredUserId = String(before.registeredUserId);
      const organizationId = String(before.organizationId);
      if (before.exists === false) {
        await tx.allStarVaultAccess.delete({
          where: {
            registeredUserId_organizationId: { registeredUserId, organizationId },
          },
        });
        return;
      }
      await tx.allStarVaultAccess.update({
        where: {
          registeredUserId_organizationId: { registeredUserId, organizationId },
        },
        data: {
          role: before.role as "FULL_ACCESS" | "LIMITED_ADMIN",
          grantedByAdminId:
            typeof before.grantedByAdminId === "string" ? before.grantedByAdminId : null,
        },
      });
      return;
    }
    case "VAULT_ACCESS_REVOKED": {
      if (!before || before.exists !== true) throw new Error("Missing vault access snapshot");
      await tx.allStarVaultAccess.create({
        data: {
          registeredUserId: String(before.registeredUserId),
          organizationId: String(before.organizationId),
          role: before.role as "FULL_ACCESS" | "LIMITED_ADMIN",
          grantedByAdminId:
            typeof before.grantedByAdminId === "string" ? before.grantedByAdminId : null,
        },
      });
      return;
    }
    case "HEAD_COACH_ADDED": {
      const assignmentId = log.entityId;
      if (!assignmentId) throw new Error("Missing assignment id");
      await tx.allStarHeadCoachAssignment.delete({ where: { id: assignmentId } });
      return;
    }
    case "HEAD_COACH_REMOVED": {
      if (!before) throw new Error("Missing head coach snapshot");
      await tx.allStarHeadCoachAssignment.create({
        data: {
          id: String(before.id),
          ballotCycleId: String(before.ballotCycleId),
          organizationId: String(before.organizationId),
          ageGroup: String(before.ageGroup),
          registeredUserId:
            typeof before.registeredUserId === "string" ? before.registeredUserId : null,
          adminUserId: typeof before.adminUserId === "string" ? before.adminUserId : null,
          coachName: typeof before.coachName === "string" ? before.coachName : null,
          coachEmail: typeof before.coachEmail === "string" ? before.coachEmail : null,
        },
      });
      return;
    }
    case "BALLOT_LINK_GENERATED": {
      const cycleId = log.entityId;
      if (!cycleId || !before) throw new Error("Missing ballot link snapshot");
      await tx.allStarBallotCycle.update({
        where: { id: cycleId },
        data: {
          ballotLinkToken:
            typeof before.ballotLinkToken === "string" ? before.ballotLinkToken : null,
          ballotLinkTokenHash:
            typeof before.ballotLinkTokenHash === "string"
              ? before.ballotLinkTokenHash
              : null,
        },
      });
      return;
    }
    case "VOTE_SUBMISSION_DELETED": {
      if (!before) throw new Error("Missing vote submission snapshot");
      const snap = before as VoteSubmissionSnapshot;
      const recreated = await tx.allStarVoteSubmission.create({
        data: {
          id: snap.submission.id,
          ballotCycleId: snap.submission.ballotCycleId,
          coachUserId: snap.submission.coachUserId,
          phase: snap.submission.phase as "FIRST_TEAM" | "SECOND_TEAM",
          organizationId: snap.submission.organizationId,
          ageGroup: snap.submission.ageGroup,
          submittedAt: new Date(snap.submission.submittedAt),
        },
      });
      if (snap.voteItems.length > 0) {
        await tx.allStarVoteItem.createMany({
          data: snap.voteItems.map((item) => ({
            voteSubmissionId: recreated.id,
            candidateId: item.candidateId,
            rating: item.rating,
          })),
        });
      }
      return;
    }
    default:
      throw new Error("This change type cannot be reverted");
  }
}

export async function revertAllStarAuditLog(params: {
  logId: string;
  organizationId: string;
  adminUserId: string;
}) {
  const log = await prisma.allStarAuditLog.findUnique({ where: { id: params.logId } });
  if (!log || log.organizationId !== params.organizationId) {
    throw new Error("Audit log entry not found");
  }
  if (log.revertedAt) {
    throw new Error("This change was already reverted");
  }
  if (!canRevertAllStarAuditAction(log.action)) {
    throw new Error("This change type cannot be reverted automatically");
  }

  await prisma.$transaction(async (tx) => {
    await applyAllStarAuditRevert(tx, log);
    await tx.allStarAuditLog.update({
      where: { id: log.id },
      data: {
        revertedAt: new Date(),
        revertedByAdminId: params.adminUserId,
      },
    });
  });
}

export function snapshotCandidate(row: {
  id: string;
  ballotCycleId: string;
  organizationId: string;
  ageGroup: string;
  playerFullName: string;
  team: string;
  jerseyNumber: string;
  showcaseBibNumber: string | null;
  isActive: boolean;
  excludedFromSecondPhase: boolean;
  secondPhaseOverrideReason: string | null;
  secondPhaseOverrideAt: Date | null;
  secondPhaseOverrideByAdminId: string | null;
  finalRosterOverride: "SELECTED" | "REMOVED" | null;
  finalRosterOverrideReason: string | null;
  finalRosterOverrideAt: Date | null;
  finalRosterOverrideByAdminId: string | null;
}): CandidateSnapshot {
  return {
    id: row.id,
    ballotCycleId: row.ballotCycleId,
    organizationId: row.organizationId,
    ageGroup: row.ageGroup,
    playerFullName: row.playerFullName,
    team: row.team,
    jerseyNumber: row.jerseyNumber,
    showcaseBibNumber: row.showcaseBibNumber,
    isActive: row.isActive,
    excludedFromSecondPhase: row.excludedFromSecondPhase,
    secondPhaseOverrideReason: row.secondPhaseOverrideReason,
    secondPhaseOverrideAt: row.secondPhaseOverrideAt?.toISOString() ?? null,
    secondPhaseOverrideByAdminId: row.secondPhaseOverrideByAdminId,
    finalRosterOverride: row.finalRosterOverride,
    finalRosterOverrideReason: row.finalRosterOverrideReason,
    finalRosterOverrideAt: row.finalRosterOverrideAt?.toISOString() ?? null,
    finalRosterOverrideByAdminId: row.finalRosterOverrideByAdminId,
  };
}

export function snapshotCycle(row: {
  status: string;
  accessMode: string;
  hasShowcase: boolean;
  requiredRatingsPerCoach: number;
  title: string | null;
  publishedAt: Date | null;
  closedAt: Date | null;
  activePhase: string;
  allStarAgeGroupId: string | null;
  allStarAgeGroupLabel: string | null;
  ballotLinkToken?: string | null;
  ballotLinkTokenHash?: string | null;
}): CycleSnapshot {
  return {
    status: row.status,
    accessMode: row.accessMode,
    hasShowcase: row.hasShowcase,
    requiredRatingsPerCoach: row.requiredRatingsPerCoach,
    title: row.title,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    activePhase: row.activePhase,
    allStarAgeGroupId: row.allStarAgeGroupId,
    allStarAgeGroupLabel: row.allStarAgeGroupLabel,
    ballotLinkToken: row.ballotLinkToken ?? null,
    ballotLinkTokenHash: row.ballotLinkTokenHash ?? null,
  };
}

export function snapshotFinalRoster(row: {
  finalRosterOverride: "SELECTED" | "REMOVED" | null;
  finalRosterOverrideReason: string | null;
  finalRosterOverrideAt: Date | null;
  finalRosterOverrideByAdminId: string | null;
}): FinalRosterSnapshot {
  return {
    finalRosterOverride: row.finalRosterOverride,
    finalRosterOverrideReason: row.finalRosterOverrideReason,
    finalRosterOverrideAt: row.finalRosterOverrideAt?.toISOString() ?? null,
    finalRosterOverrideByAdminId: row.finalRosterOverrideByAdminId,
  };
}
