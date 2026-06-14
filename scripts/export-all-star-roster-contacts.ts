/**
 * Export finalized All-Star roster contact CSV from production (or any DATABASE_URL).
 *
 * Usage:
 *   npx tsx scripts/export-all-star-roster-contacts.ts
 *   npx tsx scripts/export-all-star-roster-contacts.ts --org gonzales --year 2026
 *   npx tsx scripts/export-all-star-roster-contacts.ts --cycle <cycleId> --out /tmp/roster-contacts.csv
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildRosterContactRows,
  rosterContactRowsToCsv,
} from "@/lib/allStar/rosterContactExport";
import prisma from "@/lib/prisma";
import { isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1]?.trim() || undefined;
}

async function main() {
  const cycleId = readArg("--cycle");
  const orgParam = readArg("--org");
  const yearParam = readArg("--year");
  const outPath = readArg("--out");

  let organizationId: ContentOrgId | undefined;
  if (orgParam) {
    if (!isContentOrgId(orgParam)) {
      throw new Error(`Invalid --org: ${orgParam}`);
    }
    organizationId = orgParam;
  }

  const seasonYear = yearParam ? Number.parseInt(yearParam, 10) : undefined;
  if (yearParam && (!Number.isFinite(seasonYear) || seasonYear! < 2000)) {
    throw new Error(`Invalid --year: ${yearParam}`);
  }

  if (!cycleId && !organizationId) {
    throw new Error("Provide --cycle <id> or --org gonzales|ascension (optional --year)");
  }

  const rows = await buildRosterContactRows(prisma, {
    cycleId,
    organizationId,
    seasonYear,
  });

  if (rows.length === 0) {
    console.log("No finalized All-Star roster players found.");
    return;
  }

  const csv = rosterContactRowsToCsv(rows);
  const matched = rows.filter((row) => row.emailMatchStatus === "matched").length;
  const missing = rows.length - matched;

  const defaultName = organizationId
    ? `all-star-roster-contacts-${organizationId}${seasonYear ? `-${seasonYear}` : ""}.csv`
    : `all-star-roster-contacts-${cycleId}.csv`;
  const target = resolve(outPath || defaultName);
  writeFileSync(target, csv, "utf8");

  console.log(`Wrote ${rows.length} players to ${target}`);
  console.log(`Emails matched: ${matched}; missing: ${missing}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
