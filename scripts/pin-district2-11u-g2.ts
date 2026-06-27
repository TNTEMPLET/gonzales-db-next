/**
 * Pin ladistrict2 11U G2 GameChanger event (already LIVE in GC).
 *
 * Usage:
 *   pnpm exec tsx --env-file=.env.local scripts/pin-district2-11u-g2.ts
 */
import prisma from "../lib/prisma";
import { bracketGameChangerSchema } from "../lib/gamechanger/types";
import { mergeBracketSpec, safeParseBracketSpec } from "../lib/tournament-brackets/bracketSpec";

const BRACKET_PROJECT_ID = "cmqiazafz000004lef08ell73";
const MATCH_ID = "de-w-r0-m1-a1c6e6ad";
const EVENT_ID = "fa865e09-ca5c-4288-8202-54ebd7dd19fc";

async function main(): Promise<void> {
  const row = await prisma.bracketProject.findUnique({
    where: { id: BRACKET_PROJECT_ID },
    select: { id: true, name: true, spec: true },
  });
  if (!row) {
    throw new Error(`Bracket project not found: ${BRACKET_PROJECT_ID}`);
  }

  const parsed = safeParseBracketSpec(row.spec);
  if (!parsed.ok) {
    throw new Error(`${row.name}: invalid bracket spec`);
  }

  const gc = bracketGameChangerSchema.parse(parsed.spec.gameChanger);
  const spec = mergeBracketSpec(parsed.spec, {
    gameChanger: {
      ...gc,
      matchEventPins: {
        ...(gc.matchEventPins ?? {}),
        [MATCH_ID]: EVENT_ID,
      },
    },
  });

  await prisma.bracketProject.update({
    where: { id: BRACKET_PROJECT_ID },
    data: { spec: JSON.parse(JSON.stringify(spec)) },
  });

  console.log(
    JSON.stringify({
      bracketProjectId: BRACKET_PROJECT_ID,
      name: row.name,
      pinned: { [MATCH_ID]: EVENT_ID },
      allPins: spec.gameChanger?.matchEventPins ?? {},
    }),
  );
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`PIN FAILED: ${message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
