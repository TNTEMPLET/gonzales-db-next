/**
 * Force-import completed GameChanger scores (repeat passes until bracket feeders are filled).
 */
import prisma from "@/lib/prisma";
import { syncGameChangerToProject } from "@/lib/gamechanger/syncGameChangerToProject";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Usage: import-gc-bracket-finals.ts <projectId> [...]");
  process.exit(1);
}

async function run(id: string) {
  const row = await prisma.bracketProject.findUnique({ where: { id } });
  if (!row) return;
  const parsed = safeParseBracketSpec(row.spec);
  if (!parsed.ok) return;

  let spec = parsed.spec;
  for (let pass = 1; pass <= 4; pass++) {
    const result = await syncGameChangerToProject(spec, { forceImportCompleted: true });
    spec = result.spec;
    const n = result.live.importedMatchIds?.length ?? 0;
    console.log(row.name, "pass", pass, "imported", n);
    if (n === 0) break;
  }

  await prisma.bracketProject.update({
    where: { id },
    data: { spec: JSON.parse(JSON.stringify(spec)) },
  });
}

async function main() {
  for (const id of ids) await run(id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
