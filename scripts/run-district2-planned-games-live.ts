/**
 * Create planned Schedule Manager games in GameChanger (LIVE) for ladistrict2 brackets.
 * Skips pinned/scored/placeholder games via the decision engine — safe against duplicates.
 *
 * Usage (dev-box with prod DATABASE_URL in .env.local):
 *   BRACKET_IDS=cmqiazafz000004lef08ell73,cmqij4xh0000004l2wp2nvto9,cmqh68wqv000004l7f0c0p3rc \
 *   GAMECHANGER_SCHEDULE_WRITER_ENABLED=true \
 *   GAMECHANGER_SCHEDULE_WRITER_ENDPOINT=https://gc-writer.duckroostdigital.com \
 *   GAMECHANGER_SCHEDULE_WRITER_SECRET=... \
 *   pnpm exec tsx --env-file=.env.local scripts/run-district2-planned-games-live.ts
 */
import prisma from "../lib/prisma";
import { findUnlockedScheduleManagerGames } from "../lib/gamechanger/schedule-manager/decisionEngine";
import { runScheduleManager } from "../lib/gamechanger/schedule-manager/runScheduleManager";
import { bracketGameChangerSchema } from "../lib/gamechanger/types";
import { safeParseBracketSpec } from "../lib/tournament-brackets/bracketSpec";

const DEFAULT_IDS = [
  "cmqiazafz000004lef08ell73", // 11U
  "cmqij4xh0000004l2wp2nvto9", // 10U
  "cmqh68wqv000004l7f0c0p3rc", // 12U
];

async function main(): Promise<void> {
  const bracketIds = (process.env.BRACKET_IDS?.trim() || DEFAULT_IDS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (process.env.GAMECHANGER_SCHEDULE_WRITER_ENABLED !== "true") {
    throw new Error("Set GAMECHANGER_SCHEDULE_WRITER_ENABLED=true");
  }
  if (!process.env.GAMECHANGER_SCHEDULE_WRITER_ENDPOINT?.trim()) {
    throw new Error("Set GAMECHANGER_SCHEDULE_WRITER_ENDPOINT");
  }

  let exitCode = 0;
  for (const bracketProjectId of bracketIds) {
    const row = await prisma.bracketProject.findUnique({
      where: { id: bracketProjectId },
      select: { id: true, name: true, seasonYear: true, spec: true, status: true },
    });
    if (!row) {
      console.error(`Missing bracket ${bracketProjectId}`);
      exitCode = 1;
      continue;
    }

    const parsed = safeParseBracketSpec(row.spec);
    if (!parsed.ok) {
      console.error(`Invalid spec for ${row.name}`);
      exitCode = 1;
      continue;
    }

    const preflight = findUnlockedScheduleManagerGames({
      bracketProjectId: row.id,
      seasonYear: row.seasonYear,
      spec: parsed.spec,
    });

    console.log(`\n=== ${row.name} (${row.id}) ===`);
    console.log(
      `Preflight: ${preflight.planned.length} planned, ${preflight.skipped.length} skipped`,
    );
    for (const game of preflight.planned) {
      console.log(
        `  PLAN G${game.gameNumber}: ${game.homeTeam} vs ${game.awayTeam} @ ${game.dateLabel} ${game.time} ${game.field ?? ""}`,
      );
    }

    if (preflight.planned.length === 0) {
      console.log("  Nothing to create.");
      continue;
    }

    const result = await runScheduleManager({
      mode: "LIVE",
      bracketProjectId: row.id,
    });

    console.log(
      `LIVE: created=${result.createdCount} skipped=${result.skippedCount} failed=${result.failedCount}`,
    );
    for (const created of result.planned.filter((p) =>
      result.errors.length === 0 || result.createdCount > 0,
    )) {
      console.log(`  queued G${created.gameNumber}: ${created.homeTeam} vs ${created.awayTeam}`);
    }
    for (const error of result.errors) {
      console.error(`  ERROR: ${error}`);
    }

    const after = await prisma.bracketProject.findUnique({
      where: { id: row.id },
      select: { spec: true },
    });
    const afterParsed = after ? safeParseBracketSpec(after.spec) : null;
    const pins =
      afterParsed?.ok && afterParsed.spec.gameChanger
        ? bracketGameChangerSchema.parse(afterParsed.spec.gameChanger).matchEventPins ?? {}
        : {};
    console.log(`  pins now: ${Object.keys(pins).length}`);

    if (result.failedCount > 0) {
      exitCode = 1;
    }
  }

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
