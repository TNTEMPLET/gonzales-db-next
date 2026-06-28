import type { Prisma } from "@prisma/client";

import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import {
  findUnlockedScheduleManagerGames,
  isBracketEligibleForScheduleManager,
} from "@/lib/gamechanger/schedule-manager/decisionEngine";
import {
  gcWebFormScheduleFromBracketLabels,
  gcWebFormScheduleFromInstant,
} from "@/lib/gamechanger/schedule-manager/gcWebFormTime";
import { createGameChangerScheduleWriter } from "@/lib/gamechanger/schedule-manager/writer";
import type {
  GameChangerCreateGameInput,
  ScheduleManagerActionSummary,
  ScheduleManagerRunMode,
} from "@/lib/gamechanger/schedule-manager/types";
import { fetchGameChangerScoreboard, scoreboardDayStartIso } from "@/lib/gamechanger/fetchScoreboard";
import { syncGameChangerToProject } from "@/lib/gamechanger/syncGameChangerToProject";
import prisma from "@/lib/prisma";
import { mergeBracketSpec, safeParseBracketSpec, type BracketSpec } from "@/lib/tournament-brackets/bracketSpec";

export type RunScheduleManagerOptions = {
  mode: ScheduleManagerRunMode;
  createdByAdminId?: string;
  bracketProjectId?: string;
};

export type RunScheduleManagerResult = {
  jobId: string;
  status: "COMPLETED" | "FAILED" | "PARTIAL";
  totalCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  planned: ScheduleManagerActionSummary[];
  skipped: Array<{ bracketProjectId: string; matchId: string; reason: string }>;
  errors: string[];
};

type BracketProjectRow = {
  id: string;
  organizationId: string;
  seasonYear: number;
  name: string;
  spec: unknown;
};

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function loadEligibleBrackets(bracketProjectId?: string): Promise<BracketProjectRow[]> {
  return prisma.bracketProject.findMany({
    where: {
      status: "READY",
      ...(bracketProjectId ? { id: bracketProjectId } : {}),
    },
    orderBy: [{ organizationId: "asc" }, { priority: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      organizationId: true,
      seasonYear: true,
      name: true,
      spec: true,
    },
  });
}

async function existingCreateBlockers(bracketProjectId: string): Promise<Set<string>> {
  const rows = await prisma.scheduleManagerAction.findMany({
    where: {
      bracketProjectId,
      status: { in: ["PLANNED", "CREATED"] },
    },
    select: { matchId: true },
  });
  return new Set(rows.map((row) => row.matchId));
}

function actionRequestSummary(action: ScheduleManagerActionSummary): Record<string, unknown> {
  return {
    bracketProjectId: action.bracketProjectId,
    matchId: action.matchId,
    gameNumber: action.gameNumber,
    division: action.divisionLabel,
    date: action.dateLabel,
    time: action.time,
    scheduledFor: action.scheduledFor?.toISOString(),
    venue: action.venue,
    field: action.field,
    homeTeam: action.homeTeam,
    awayTeam: action.awayTeam,
  };
}

function buildWriterInput(
  row: BracketProjectRow,
  action: ScheduleManagerActionSummary,
  widgetId: string,
  gcOrganizationId: string,
): GameChangerCreateGameInput {
  let gcFormDate: string | undefined;
  let gcFormTime: string | undefined;
  if (action.dateLabel) {
    const form = gcWebFormScheduleFromBracketLabels(action.dateLabel, action.time, row.seasonYear);
    if (form) {
      gcFormDate = form.gcFormDate;
      gcFormTime = form.gcFormTime;
    }
  }
  if (!gcFormDate || !gcFormTime) {
    if (action.scheduledFor) {
      const form = gcWebFormScheduleFromInstant(action.scheduledFor);
      gcFormDate = form.gcFormDate;
      gcFormTime = form.gcFormTime;
    }
  }

  return {
    bracketProjectId: row.id,
    matchId: action.matchId,
    date: action.dateLabel,
    time: action.time,
    scheduledFor: action.scheduledFor,
    field: action.field,
    venue: action.venue,
    homeTeam: action.homeTeam,
    awayTeam: action.awayTeam,
    division: action.divisionLabel,
    gameNumber: action.gameNumber,
    widgetId,
    gcOrganizationId,
    gcFormDate,
    gcFormTime,
    durationLabel: "2 hr",
  };
}

async function resolveGcOrganizationId(widgetId: string): Promise<string> {
  const scoreboard = await fetchGameChangerScoreboard(widgetId, scoreboardDayStartIso());
  return scoreboard.data.organization.id;
}

function pinCreatedEvent(spec: BracketSpec, matchId: string, eventId: string): BracketSpec {
  const gc = bracketGameChangerSchema.parse(spec.gameChanger);
  return mergeBracketSpec(spec, {
    gameChanger: {
      ...gc,
      matchEventPins: {
        ...(gc.matchEventPins ?? {}),
        [matchId]: eventId,
      },
    },
  });
}

export async function runScheduleManager(options: RunScheduleManagerOptions): Promise<RunScheduleManagerResult> {
  const job = await prisma.scheduleManagerJob.create({
    data: {
      organizationId: "ap-baseball",
      mode: options.mode,
      status: "RUNNING",
      createdByAdminId: options.createdByAdminId,
      payload: toPrismaJson({
        bracketProjectId: options.bracketProjectId,
      }),
    },
  });

  const writer = createGameChangerScheduleWriter(options.mode);
  const result: RunScheduleManagerResult = {
    jobId: job.id,
    status: "COMPLETED",
    totalCount: 0,
    createdCount: 0,
    skippedCount: 0,
    failedCount: 0,
    planned: [],
    skipped: [],
    errors: [],
  };

  try {
    const rows = await loadEligibleBrackets(options.bracketProjectId);
    for (const row of rows) {
      const parsed = safeParseBracketSpec(row.spec);
      if (!parsed.ok || !isBracketEligibleForScheduleManager("READY", parsed.spec)) continue;

      let spec = parsed.spec;
      const gcConfig = bracketGameChangerSchema.parse(spec.gameChanger);
      const widgetId = gcConfig.widgetId;
      let gcOrganizationId: string | undefined;
      try {
        gcOrganizationId = await resolveGcOrganizationId(widgetId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`${row.name}: ${message}`);
        result.failedCount += 1;
        continue;
      }

      try {
        const syncResult = await syncGameChangerToProject(spec, { autoImport: true });
        spec = syncResult.spec;
        if (syncResult.specUpdated) {
          await prisma.bracketProject.update({
            where: { id: row.id },
            data: { spec: JSON.parse(JSON.stringify(spec)) },
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`${row.name}: ${message}`);
        result.failedCount += 1;
        continue;
      }

      const existingMatchIds = await existingCreateBlockers(row.id);
      const decision = findUnlockedScheduleManagerGames({
        bracketProjectId: row.id,
        seasonYear: row.seasonYear,
        spec,
        existingActionMatchIds: existingMatchIds,
      });
      result.skipped.push(...decision.skipped.map((skip) => ({ bracketProjectId: row.id, ...skip })));
      result.skippedCount += decision.skipped.length;

      for (const action of decision.planned) {
        result.totalCount += 1;
        result.planned.push(action);
        const requestSummary = actionRequestSummary(action);

        await prisma.scheduleManagerAction.upsert({
          where: { bracketProjectId_matchId: { bracketProjectId: row.id, matchId: action.matchId } },
          update: {
            jobId: job.id,
            organizationId: row.organizationId,
            divisionLabel: action.divisionLabel,
            gameNumber: action.gameNumber,
            scheduledFor: action.scheduledFor,
            field: action.field ?? action.venue,
            homeTeam: action.homeTeam,
            awayTeam: action.awayTeam,
            status: "PLANNED",
            requestSummary: toPrismaJson(requestSummary),
            errorMessage: null,
          },
          create: {
            jobId: job.id,
            organizationId: row.organizationId,
            bracketProjectId: row.id,
            matchId: action.matchId,
            divisionLabel: action.divisionLabel,
            gameNumber: action.gameNumber,
            scheduledFor: action.scheduledFor,
            field: action.field ?? action.venue,
            homeTeam: action.homeTeam,
            awayTeam: action.awayTeam,
            status: "PLANNED",
            requestSummary: toPrismaJson(requestSummary),
          },
        });

        try {
          const writeResult = await writer.createGame(buildWriterInput(row, action, widgetId, gcOrganizationId));
          await prisma.scheduleManagerAction.update({
            where: { bracketProjectId_matchId: { bracketProjectId: row.id, matchId: action.matchId } },
            data: {
              status: writeResult.dryRun ? "DRY_RUN" : "CREATED",
              gameChangerEventId: writeResult.eventId,
              requestSummary: toPrismaJson(writeResult.requestSummary),
              responseSummary: toPrismaJson(writeResult.responseSummary),
            },
          });
          if (writeResult.eventId) {
            spec = pinCreatedEvent(spec, action.matchId, writeResult.eventId);
            await prisma.bracketProject.update({
              where: { id: row.id },
              data: { spec: JSON.parse(JSON.stringify(spec)) },
            });
            result.createdCount += 1;
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          await prisma.scheduleManagerAction.update({
            where: { bracketProjectId_matchId: { bracketProjectId: row.id, matchId: action.matchId } },
            data: {
              status: "FAILED",
              errorMessage: message,
              responseSummary: toPrismaJson({ error: message }),
            },
          });
          result.failedCount += 1;
          result.errors.push(`${row.name} ${action.matchId}: ${message}`);
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    result.failedCount += 1;
    result.errors.push(message);
  }

  result.status = result.failedCount > 0 ? (result.totalCount > result.failedCount ? "PARTIAL" : "FAILED") : "COMPLETED";
  await prisma.scheduleManagerJob.update({
    where: { id: job.id },
    data: {
      status: result.status,
      totalCount: result.totalCount,
      createdCount: result.createdCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
      results: toPrismaJson(result),
      errorMessage: result.errors[0],
      completedAt: new Date(),
    },
  });

  return result;
}
