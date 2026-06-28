/**
 * Pin ladistrict2 9U G3/G4 GameChanger events.
 *
 * Usage:
 *   pnpm exec tsx --env-file=.env.local scripts/pin-district2-9u-g3-g4.ts
 */
import prisma from "../lib/prisma";
import { bracketGameChangerSchema } from "../lib/gamechanger/types";
import { mergeBracketSpec, safeParseBracketSpec } from "../lib/tournament-brackets/bracketSpec";

const BRACKET_PROJECT_ID = "cmqjqulyf000004l1n2il0hfc";
const PINS: Record<string, string> = {
  "de-w-r1-m0-71f9c580": "ef5a14bb-15ae-4a87-8aa2-371ff694e46c", // G3 Westbank vs Ascension
  "de-l-r0-m0-1536c983": "ec020b27-1fee-47e5-8c9b-01d8792b08c1", // G4 NORD vs St. Charles
};

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
        ...PINS,
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
      pinned: PINS,
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
