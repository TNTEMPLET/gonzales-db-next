/**
 * Create ladistrict2 9U G3/G4 in GameChanger via homelab writer and pin bracket matches.
 *
 * Usage (dev-box with prod DATABASE_URL in .env.local):
 *   pnpm exec tsx --env-file=.env.local scripts/run-district2-9u-g3-g4-live.ts
 */
import prisma from "../lib/prisma";
import { bracketGameChangerSchema } from "../lib/gamechanger/types";
import { mergeBracketSpec, safeParseBracketSpec } from "../lib/tournament-brackets/bracketSpec";
import { runScheduleManager } from "../lib/gamechanger/schedule-manager/runScheduleManager";

const BRACKET_PROJECT_ID = "cmqjqulyf000004l1n2il0hfc";

async function main(): Promise<void> {
  const result = await runScheduleManager({
    mode: "LIVE",
    bracketProjectId: BRACKET_PROJECT_ID,
  });

  const row = await prisma.bracketProject.findUnique({
    where: { id: BRACKET_PROJECT_ID },
    select: { name: true, spec: true },
  });
  const parsed = row ? safeParseBracketSpec(row.spec) : null;
  const pins =
    parsed?.ok && parsed.spec.gameChanger
      ? bracketGameChangerSchema.parse(parsed.spec.gameChanger).matchEventPins ?? {}
      : {};

  console.log(
    JSON.stringify(
      {
        bracketProjectId: BRACKET_PROJECT_ID,
        name: row?.name,
        result,
        matchEventPins: pins,
      },
      null,
      2,
    ),
  );

  if (result.failedCount > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`LIVE FAILED: ${message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
