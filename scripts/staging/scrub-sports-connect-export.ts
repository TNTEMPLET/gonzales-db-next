/**
 * Write a scrubbed copy of a SportsConnect enrollment export.
 *
 *   npx tsx scripts/staging/scrub-sports-connect-export.ts \
 *     --in ./Enrollment_Details.xlsx \
 *     --out ./Enrollment_Details.scrubbed.xlsx
 *
 * The input file stays on this machine. Do not upload the unscrubbed export.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";

import * as XLSX from "xlsx";

import { scrubSportsConnectRows } from "../../lib/staging/scrubSportsConnectExport";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1]?.trim();
}

const inputArg = readArg("--in");
if (!inputArg) {
  console.error(
    "Usage: tsx scripts/staging/scrub-sports-connect-export.ts --in export.xlsx --out scrubbed.xlsx",
  );
  process.exit(1);
}

const inputPath = resolve(inputArg);
const outputArg = readArg("--out");
const outputPath = outputArg
  ? resolve(outputArg)
  : inputPath.replace(/(\.[^.]+)?$/, ".scrubbed$1");

const workbook = XLSX.read(readFileSync(inputPath), { type: "buffer", raw: false });
const sheetName = workbook.SheetNames[0];
if (!sheetName) {
  console.error("Workbook has no sheets.");
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]!, {
  defval: "",
  raw: false,
});
const scrubbed = scrubSportsConnectRows(rows);
const next = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(next, XLSX.utils.json_to_sheet(scrubbed), sheetName);

const ext = extname(outputPath).toLowerCase();
if (ext === ".csv") {
  writeFileSync(outputPath, XLSX.utils.sheet_to_csv(next.Sheets[sheetName]!));
} else {
  writeFileSync(outputPath, XLSX.write(next, { type: "buffer", bookType: "xlsx" }));
}

console.log(`Wrote ${scrubbed.length} scrubbed rows to ${outputPath}`);
