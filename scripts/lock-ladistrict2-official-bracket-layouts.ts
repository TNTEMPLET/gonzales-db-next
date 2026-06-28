/**
 * One-time / maintenance: persist classic layout lock on official Little League brackets.
 * Run with production DATABASE_URL when tournament brackets must not drift to connected_columns.
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/lock-ladistrict2-official-bracket-layouts.ts
 */
import prisma from "../lib/prisma";
import { mergeBracketSpec, safeParseBracketSpec } from "../lib/tournament-brackets/bracketSpec";
import {
  inferLockedClassicVariant,
  lockedOfficialClassicLayoutPatch,
} from "../lib/tournament-brackets/doubleEliminationClassicLayoutTemplate";
import { buildBracketLayout } from "../lib/tournament-brackets/bracketLayout";

const ORG_ID = "ladistrict2";

async function main(): Promise<void> {
  const rows = await prisma.bracketProject.findMany({
    where: { organizationId: ORG_ID, status: "READY" },
    select: { id: true, name: true, spec: true },
    orderBy: { priority: "desc" },
  });

  let updated = 0;
  for (const row of rows) {
    const parsed = safeParseBracketSpec(row.spec);
    if (!parsed.ok) {
      console.warn(`skip ${row.name}: invalid spec`);
      continue;
    }
    const spec = parsed.spec;
    const variant = resolveOfficialClassicVariant(spec.officialTemplateId, spec.bracketFormat);
    if (!variant) {
      console.log(`skip ${row.name}: not a lockable official classic template`);
      continue;
    }

    const patch = lockedOfficialClassicLayoutPatch(spec);
    const needsLock = patch.classicDoubleElimLayoutLocked === true;
    const needsLayoutPref = patch.layoutPreference === "official" && spec.layoutPreference !== "official";
    if (!needsLock && !needsLayoutPref) {
      const layout = buildBracketLayout(spec);
      const ok =
        layout.mode === "double_elimination" &&
        layout.diagramStyle === "classic_unified" &&
        layout.classicVariant === variant;
      console.log(`${row.name}: already locked (${ok ? "classic_unified" : "check layout"})`);
      continue;
    }

    const next = mergeBracketSpec(spec, patch);
    const layout = buildBracketLayout(next);
    await prisma.bracketProject.update({
      where: { id: row.id },
      data: { spec: next as object },
    });
    updated += 1;
    console.log(
      `locked ${row.name} (${row.id}) →`,
      layout.mode === "double_elimination"
        ? `${layout.diagramStyle} ${layout.classicVariant ?? ""}`
        : layout.mode,
    );
  }

  console.log(`Done. Updated ${updated} bracket(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
