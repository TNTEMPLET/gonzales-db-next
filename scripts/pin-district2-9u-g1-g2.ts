/**
 * Pin ladistrict2 9U G1/G2 GameChanger events (already LIVE in GC).
 *
 * Usage:
 *   pnpm exec tsx --env-file=.env.local scripts/pin-district2-9u-g1-g2.ts
 */
import prisma from "../lib/prisma";
import { bracketGameChangerSchema } from "../lib/gamechanger/types";
import { mergeBracketSpec, safeParseBracketSpec } from "../lib/tournament-brackets/bracketSpec";

const BRACKET_PROJECT_ID = "cmqjqulyf000004l1n2il0hfc";
const PINS: Record<string, string> = {
  "de-w-r0-m0-31211628": "22db4188-b6a9-4885-9af1-5a75443f9050", // G1 NORD vs Westbank (GC home/away flipped)
  "de-w-r0-m1-9fa5dc2e": "f3fc36a3-dbc8-48cc-be07-54142e734936", // G2 Eastbank vs St. Charles
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
