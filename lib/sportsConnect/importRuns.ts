import "server-only";

import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

import type {
  SportsConnectImportRunView,
  SportsConnectReportKind,
  SportsConnectRunStatus,
} from "./types";
import { isSportsConnectReportKind } from "./types";

const RUN_STATUSES = new Set<string>([
  "PREVIEW",
  "RUNNING",
  "DONE",
  "FAILED",
  "CANCELLED",
]);

function asStatus(value: string): SportsConnectRunStatus {
  return RUN_STATUSES.has(value) ? (value as SportsConnectRunStatus) : "PREVIEW";
}

function asSummary(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function mapImportRunRow(row: {
  id: string;
  organizationId: string;
  seasonYear: number;
  reportKind: string;
  status: string;
  sourceFileName: string | null;
  presetId: string | null;
  summary: Prisma.JsonValue | null;
  errorMessage: string | null;
  teamPlayerBatchId: string | null;
  coachBatchId: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): SportsConnectImportRunView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    seasonYear: row.seasonYear,
    reportKind: isSportsConnectReportKind(row.reportKind)
      ? row.reportKind
      : "PLAYER_REG",
    status: asStatus(row.status),
    sourceFileName: row.sourceFileName,
    presetId: row.presetId,
    summary: asSummary(row.summary),
    errorMessage: row.errorMessage,
    teamPlayerBatchId: row.teamPlayerBatchId,
    coachBatchId: row.coachBatchId,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function listImportRuns(input: {
  organizationId: string;
  seasonYear?: number;
  reportKind?: SportsConnectReportKind;
  limit?: number;
}): Promise<SportsConnectImportRunView[]> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const rows = await prisma.sportsConnectImportRun.findMany({
    where: {
      organizationId: input.organizationId,
      seasonYear: input.seasonYear,
      reportKind: input.reportKind,
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
  return rows.map(mapImportRunRow);
}

export async function getImportRun(
  id: string,
  organizationId: string,
): Promise<SportsConnectImportRunView | null> {
  const row = await prisma.sportsConnectImportRun.findFirst({
    where: { id, organizationId },
  });
  return row ? mapImportRunRow(row) : null;
}

export async function createImportRun(input: {
  organizationId: string;
  seasonYear: number;
  reportKind: SportsConnectReportKind;
  status?: SportsConnectRunStatus;
  sourceFileName?: string | null;
  presetId?: string | null;
  summary?: Record<string, unknown> | null;
  errorMessage?: string | null;
  teamPlayerBatchId?: string | null;
  coachBatchId?: string | null;
  createdByAdminId?: string | null;
}): Promise<SportsConnectImportRunView> {
  const row = await prisma.sportsConnectImportRun.create({
    data: {
      organizationId: input.organizationId,
      seasonYear: input.seasonYear,
      reportKind: input.reportKind,
      status: input.status ?? "PREVIEW",
      sourceFileName: input.sourceFileName ?? undefined,
      presetId: input.presetId ?? undefined,
      summary:
        input.summary === undefined || input.summary === null
          ? undefined
          : (input.summary as Prisma.InputJsonValue),
      errorMessage: input.errorMessage ?? undefined,
      teamPlayerBatchId: input.teamPlayerBatchId ?? undefined,
      coachBatchId: input.coachBatchId ?? undefined,
      createdByAdminId: input.createdByAdminId ?? undefined,
      completedAt:
        input.status === "DONE" ||
        input.status === "FAILED" ||
        input.status === "CANCELLED"
          ? new Date()
          : undefined,
    },
  });
  return mapImportRunRow(row);
}

export async function updateImportRun(input: {
  id: string;
  organizationId: string;
  status?: SportsConnectRunStatus;
  sourceFileName?: string | null;
  presetId?: string | null;
  summary?: Record<string, unknown> | null;
  errorMessage?: string | null;
  teamPlayerBatchId?: string | null;
  coachBatchId?: string | null;
  markComplete?: boolean;
}): Promise<SportsConnectImportRunView | null> {
  const existing = await prisma.sportsConnectImportRun.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
    select: { id: true, status: true },
  });
  if (!existing) return null;

  const terminal =
    input.status === "DONE" ||
    input.status === "FAILED" ||
    input.status === "CANCELLED" ||
    input.markComplete === true;

  const row = await prisma.sportsConnectImportRun.update({
    where: { id: input.id },
    data: {
      status: input.status,
      sourceFileName:
        input.sourceFileName === undefined ? undefined : input.sourceFileName,
      presetId: input.presetId === undefined ? undefined : input.presetId,
      summary:
        input.summary === undefined
          ? undefined
          : input.summary === null
            ? Prisma.JsonNull
            : (input.summary as Prisma.InputJsonValue),
      errorMessage:
        input.errorMessage === undefined ? undefined : input.errorMessage,
      teamPlayerBatchId:
        input.teamPlayerBatchId === undefined
          ? undefined
          : input.teamPlayerBatchId,
      coachBatchId:
        input.coachBatchId === undefined ? undefined : input.coachBatchId,
      completedAt: terminal ? new Date() : undefined,
    },
  });
  return mapImportRunRow(row);
}

/**
 * Best-effort audit write. Never throws to callers — import engines must not fail
 * solely because the SportsConnect run spine is unavailable.
 */
export async function recordImportRunSafe(
  input: Parameters<typeof createImportRun>[0],
): Promise<SportsConnectImportRunView | null> {
  try {
    return await createImportRun(input);
  } catch (err) {
    console.error(
      "[sportsConnect/importRuns] record failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function completeImportRunSafe(input: {
  id: string;
  organizationId: string;
  status: SportsConnectRunStatus;
  summary?: Record<string, unknown> | null;
  errorMessage?: string | null;
  teamPlayerBatchId?: string | null;
  coachBatchId?: string | null;
}): Promise<SportsConnectImportRunView | null> {
  try {
    return await updateImportRun({
      ...input,
      markComplete: true,
    });
  } catch (err) {
    console.error(
      "[sportsConnect/importRuns] complete failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
