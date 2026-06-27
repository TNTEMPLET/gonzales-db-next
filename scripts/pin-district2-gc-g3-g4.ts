/**
 * Pin existing GameChanger event IDs on ladistrict2 10U/12U G3/G4 bracket matches.
 *
 * Usage:
 *   pnpm exec tsx --env-file=.env.local scripts/pin-district2-gc-g3-g4.ts
 */
import prisma from "../lib/prisma";
import { bracketGameChangerSchema } from "../lib/gamechanger/types";
import { mergeBracketSpec, safeParseBracketSpec } from "../lib/tournament-brackets/bracketSpec";

const PINS: Array<{
  bracketProjectId: string;
  division: string;
  pins: Record<string, string>;
}> = [
  {
    bracketProjectId: "cmqij4xh0000004l2wp2nvto9",
    division: "10U",
    pins: {
      "pdf-winners-g3-69efb059": "733b571f-6594-4571-a020-ade42fe51c98",
      "pdf-winners-g4-baa513bc": "002bd4cd-5f43-4aef-8ce3-45e5d0aa5ee2",
    },
  },
  {
    bracketProjectId: "cmqh68wqv000004l7f0c0p3rc",
    division: "12U",
    pins: {
      "pdf-winners-g3-d4f6d754": "8ed236fa-1f23-4fd1-910b-4e447ce941af",
      "pdf-winners-g4-75507cb4": "86369bdf-3dba-4e6a-8144-63ac98799dd9",
    },
  },
];

async function main(): Promise<void> {
  for (const entry of PINS) {
    const row = await prisma.bracketProject.findUnique({
      where: { id: entry.bracketProjectId },
      select: { id: true, name: true, spec: true },
    });
    if (!row) {
      throw new Error(`Bracket project not found: ${entry.bracketProjectId}`);
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
          ...entry.pins,
        },
      },
    });

    await prisma.bracketProject.update({
      where: { id: entry.bracketProjectId },
      data: { spec: JSON.parse(JSON.stringify(spec)) },
    });

    console.log(
      JSON.stringify({
        division: entry.division,
        bracketProjectId: entry.bracketProjectId,
        name: row.name,
        pinned: entry.pins,
        allPins: spec.gameChanger?.matchEventPins ?? {},
      }),
    );
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`PIN FAILED: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
