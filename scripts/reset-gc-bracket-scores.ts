/**
 * Clear bracket scores and re-import from GameChanger for READY projects with GC configured.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reset-gc-bracket-scores.ts [--dry-run]
 *   npx tsx --env-file=.env.local scripts/reset-gc-bracket-scores.ts <projectId> [...]
 */
import prisma from "@/lib/prisma";
import { syncGameChangerToProject } from "@/lib/gamechanger/syncGameChangerToProject";
import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import { mergeBracketSpec, safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  clearBracketScoringFromSpec,
  specHasSavedScores,
} from "@/lib/tournament-brackets/bracketScoring";

const dryRun = process.argv.includes("--dry-run");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));

async function main() {
  const rows =
    ids.length > 0
      ? await prisma.bracketProject.findMany({
          where: { id: { in: ids }, status: "READY" },
          select: { id: true, name: true, spec: true },
        })
      : await prisma.bracketProject.findMany({
          where: { status: "READY" },
          select: { id: true, name: true, spec: true },
          orderBy: [{ priority: "asc" }, { name: "asc" }],
        });

  let updated = 0;
  for (const row of rows) {
    const parsed = safeParseBracketSpec(row.spec);
    if (!parsed.ok) {
      console.log("SKIP invalid spec:", row.id, row.name);
      continue;
    }
    const gcParsed = bracketGameChangerSchema.safeParse(parsed.spec.gameChanger);
    if (!gcParsed.success) {
      continue;
    }
    if (!specHasSavedScores(parsed.spec)) {
      console.log("SKIP no scores:", row.id, row.name);
      continue;
    }

    const cleared = clearBracketScoringFromSpec(parsed.spec);
    const clearedGc = mergeBracketSpec(cleared, {
      gameChanger: {
        ...gcParsed.data,
        importedFinalEventIds: [],
      },
    });

    if (dryRun) {
      console.log("DRY RUN would reset:", row.id, row.name);
      continue;
    }

    let nextSpec = clearedGc;
    for (let pass = 1; pass <= 4; pass++) {
      const result = await syncGameChangerToProject(nextSpec, {
        forceImportCompleted: true,
      });
      nextSpec = result.spec;
      const n = result.live.importedMatchIds?.length ?? 0;
      if (n === 0) break;
    }

    await prisma.bracketProject.update({
      where: { id: row.id },
      data: { spec: JSON.parse(JSON.stringify(nextSpec)) },
    });

    console.log(
      "RESET",
      row.id,
      row.name,
      "imported",
      result.live.importedMatchIds?.length ?? 0,
      "matches",
    );
    updated++;
  }

  console.log(dryRun ? "Dry run complete." : `Updated ${updated} bracket(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
