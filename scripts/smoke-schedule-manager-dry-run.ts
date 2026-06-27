/**
 * End-to-end Schedule Manager dry-run smoke test for District 2 9U–12U brackets.
 *
 * Usage (dev-box):
 *   pnpm exec tsx --env-file=.env.local --env-file=.env.development.local \
 *     scripts/smoke-schedule-manager-dry-run.ts
 *
 * Optional:
 *   DIVISIONS=9U,10U,11U,12U SMOKE_ENABLE_SCHEDULE_MANAGER=1
 */
import prisma from "../lib/prisma";
import { fetchGameChangerScoreboard, scoreboardDayStartIso } from "../lib/gamechanger/fetchScoreboard";
import {
  findUnlockedScheduleManagerGames,
  isBracketEligibleForScheduleManager,
} from "../lib/gamechanger/schedule-manager/decisionEngine";
import {
  gcWebFormScheduleFromBracketLabels,
  gcWebFormScheduleFromInstant,
} from "../lib/gamechanger/schedule-manager/gcWebFormTime";
import { runScheduleManager } from "../lib/gamechanger/schedule-manager/runScheduleManager";
import { mergeBracketSpec, safeParseBracketSpec } from "../lib/tournament-brackets/bracketSpec";

const ORG_ID = "ladistrict2";
const SEASON_YEAR = 2026;
const TARGET_DIVISIONS = (process.env.DIVISIONS?.trim() || "9U,10U,11U,12U")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function divisionKey(label: string | null | undefined): string | null {
  if (!label) return null;
  const match = label.match(/\b(9U|10U|11U|12U)\b/i);
  return match ? match[1]!.toUpperCase() : null;
}

function summarizeWriterPayload(input: {
  widgetId?: string;
  gcOrganizationId?: string;
  gcFormDate?: string;
  gcFormTime?: string;
  scheduledFor?: Date;
  homeTeam: string;
  awayTeam: string;
  field?: string;
  gameNumber?: string;
}) {
  return {
    widgetId: input.widgetId,
    gcOrganizationId: input.gcOrganizationId,
    gcFormDate: input.gcFormDate,
    gcFormTime: input.gcFormTime,
    scheduledFor: input.scheduledFor?.toISOString(),
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    field: input.field,
    gameNumber: input.gameNumber,
  };
}

async function main(): Promise<void> {
  const rows = await prisma.bracketProject.findMany({
    where: { organizationId: ORG_ID, seasonYear: SEASON_YEAR, status: "READY" },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    select: { id: true, name: true, seasonYear: true, spec: true },
  });

  const selected = rows.filter((row) => {
    const parsed = safeParseBracketSpec(row.spec);
    if (!parsed.ok) return false;
    const key = divisionKey(parsed.spec.divisionLabel);
    return key && TARGET_DIVISIONS.includes(key);
  });

  if (selected.length === 0) {
    throw new Error(`No READY ladistrict2 brackets matched divisions: ${TARGET_DIVISIONS.join(", ")}`);
  }

  console.log("=== Schedule Manager dry-run smoke (ladistrict2) ===");
  console.log(`Divisions: ${TARGET_DIVISIONS.join(", ")}`);
  console.log(`Matched brackets: ${selected.length}`);

  const preflight: Array<Record<string, unknown>> = [];
  for (const row of selected) {
    const parsed = safeParseBracketSpec(row.spec);
    if (!parsed.ok) continue;
    let spec = parsed.spec;
    const key = divisionKey(spec.divisionLabel) ?? "unknown";

    if (process.env.SMOKE_ENABLE_SCHEDULE_MANAGER === "1" && spec.gameChanger) {
      spec = mergeBracketSpec(spec, {
        gameChanger: {
          ...spec.gameChanger,
          scheduleManagerEnabled: true,
        },
      });
      await prisma.bracketProject.update({
        where: { id: row.id },
        data: { spec: JSON.parse(JSON.stringify(spec)) },
      });
      console.log(`Enabled Schedule Manager for ${key} (${row.id})`);
    }

    const eligible = isBracketEligibleForScheduleManager("READY", spec);
    const decision = findUnlockedScheduleManagerGames({
      bracketProjectId: row.id,
      seasonYear: row.seasonYear,
      spec,
    });

    let gcOrganizationId: string | null = null;
    if (spec.gameChanger?.widgetId) {
      try {
        const scoreboard = await fetchGameChangerScoreboard(
          spec.gameChanger.widgetId,
          scoreboardDayStartIso(),
        );
        gcOrganizationId = scoreboard.data.organization.id;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        preflight.push({ division: key, bracketProjectId: row.id, gcOrgResolveError: message });
      }
    }

    const plannedPayloads = decision.planned.map((action) => {
      let gcFormDate: string | undefined;
      let gcFormTime: string | undefined;
      if (action.scheduledFor) {
        const form = gcWebFormScheduleFromInstant(action.scheduledFor);
        gcFormDate = form.gcFormDate;
        gcFormTime = form.gcFormTime;
      } else if (action.dateLabel) {
        const form = gcWebFormScheduleFromBracketLabels(action.dateLabel, action.time, row.seasonYear);
        if (form) {
          gcFormDate = form.gcFormDate;
          gcFormTime = form.gcFormTime;
        }
      }
      return summarizeWriterPayload({
        widgetId: spec.gameChanger?.widgetId,
        gcOrganizationId: gcOrganizationId ?? undefined,
        gcFormDate,
        gcFormTime,
        scheduledFor: action.scheduledFor,
        homeTeam: action.homeTeam,
        awayTeam: action.awayTeam,
        field: action.field,
        gameNumber: action.gameNumber,
      });
    });

    preflight.push({
      division: key,
      bracketProjectId: row.id,
      name: row.name,
      eligible,
      scheduleManagerEnabled: spec.gameChanger?.scheduleManagerEnabled ?? false,
      widgetId: spec.gameChanger?.widgetId ?? null,
      gcOrganizationId,
      plannedCount: decision.planned.length,
      skippedCount: decision.skipped.length,
      planned: plannedPayloads,
      skipped: decision.skipped,
    });
  }

  console.log("\n--- Preflight decision engine ---");
  console.log(JSON.stringify(preflight, null, 2));

  const eligibleIds = preflight
    .filter((row) => row.eligible === true)
    .map((row) => row.bracketProjectId as string);

  if (eligibleIds.length === 0) {
    console.log("\nNo eligible brackets for runScheduleManager. Preflight only.");
    console.log(
      "Tip: set SMOKE_ENABLE_SCHEDULE_MANAGER=1 to temporarily enable Schedule Manager on matched brackets for this smoke run.",
    );
    return;
  }

  console.log("\n--- runScheduleManager DRY_RUN ---");
  for (const bracketProjectId of eligibleIds) {
    const result = await runScheduleManager({
      mode: "DRY_RUN",
      bracketProjectId,
    });
    console.log(JSON.stringify({ bracketProjectId, result }, null, 2));
  }

  const jobs = await prisma.scheduleManagerJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 4,
    select: {
      id: true,
      mode: true,
      status: true,
      totalCount: true,
      createdCount: true,
      skippedCount: true,
      failedCount: true,
      errorMessage: true,
      createdAt: true,
    },
  });
  console.log("\n--- Recent Schedule Manager jobs ---");
  console.log(JSON.stringify(jobs, null, 2));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`SMOKE FAILED: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
