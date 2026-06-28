/**
 * Pin ladistrict2 11U G4 + 10U/12U G5–G7 after LIVE writer created games in GC.
 */
import prisma from "../lib/prisma";
import { bracketGameChangerSchema } from "../lib/gamechanger/types";
import { mergeBracketSpec, safeParseBracketSpec } from "../lib/tournament-brackets/bracketSpec";

const PINS: Array<{ bracketProjectId: string; division: string; pins: Record<string, string> }> = [
  {
    bracketProjectId: "cmqiazafz000004lef08ell73",
    division: "11U",
    pins: {
      "de-l-r0-m0-6e30faff": "c11405c5-9a08-4767-9fc2-ceb98bb134b7",
    },
  },
  {
    bracketProjectId: "cmqij4xh0000004l2wp2nvto9",
    division: "10U",
    pins: {
      "pdf-losers-g5-0cc04c94": "912f6ac6-0e9b-473f-b34c-8b959289d2a2",
      "pdf-losers-g6-88808830": "4a65edf9-537c-4395-9c6d-37afca31b941",
      "pdf-winners-g7-998c0e10": "b0b2aac7-0d14-4222-bfb2-b856e585fb64",
    },
  },
  {
    bracketProjectId: "cmqh68wqv000004l7f0c0p3rc",
    division: "12U",
    pins: {
      "pdf-losers-g5-c7adf8c9": "2b83aa9b-0aa1-4a36-bd79-f4898035c546",
      "pdf-losers-g6-12e0cbf0": "31ad8cbb-3e03-4457-8d5c-d4138b3625f3",
      "pdf-winners-g7-fb1cfd40": "7d597f9e-c9cc-451e-a0af-d26e2903ed7e",
    },
  },
];

async function main(): Promise<void> {
  for (const entry of PINS) {
    const row = await prisma.bracketProject.findUnique({
      where: { id: entry.bracketProjectId },
      select: { id: true, name: true, spec: true },
    });
    if (!row) throw new Error(`Missing ${entry.bracketProjectId}`);

    const parsed = safeParseBracketSpec(row.spec);
    if (!parsed.ok) throw new Error(`Invalid spec ${row.name}`);

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
        name: row.name,
        newPins: entry.pins,
        totalPins: Object.keys(spec.gameChanger?.matchEventPins ?? {}).length,
      }),
    );
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
