/**
 * Fill missing All-Star roster contact emails from Enrollment_Details.xlsx (Assignr export).
 *
 * Usage:
 *   npx tsx scripts/enrich-roster-contacts-from-enrollment.ts \
 *     --enrollment /tmp/Enrollment_Details.xlsx \
 *     --in exports/all-star-roster-contacts-all-orgs-2026.csv \
 *     --out exports/all-star-roster-contacts-all-orgs-2026.csv
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import * as XLSX from "xlsx";

type EnrollmentRow = Record<string, string>;

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1]?.trim();
}

function norm(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]!;
    const next = content[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function enrollmentPlayerName(row: EnrollmentRow) {
  return norm(`${row["Player First Name"] || ""} ${row["Player Last Name"] || ""}`);
}

function enrollmentFirstLast(row: EnrollmentRow) {
  return {
    first: norm(row["Player First Name"] || ""),
    last: norm(row["Player Last Name"] || ""),
  };
}

function rosterNameParts(fullName: string) {
  const parts = norm(fullName).split(" ").filter(Boolean);
  return { first: parts[0] || "", last: parts[parts.length - 1] || "", full: norm(fullName) };
}

function teamMatches(rosterTeam: string, enrollmentTeam: string) {
  const a = norm(rosterTeam).replace(/['']/g, "");
  const b = norm(enrollmentTeam).replace(/['']/g, "");
  if (!a || !b) return true;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aRoot = a.split(" - ")[0] || a;
  const bRoot = b.split(" - ")[0] || b;
  return aRoot.includes(bRoot) || bRoot.includes(aRoot);
}

/** Same player when roster uses a nickname but enrollment has the legal first name (same last + team). */
function findNicknameEnrollmentMatch(
  enrollmentRows: EnrollmentRow[],
  playerFullName: string,
  team: string,
) {
  const target = rosterNameParts(playerFullName);
  if (!target.last) return null;
  const sameTeamLast = enrollmentRows.filter((row) => {
    const { last } = enrollmentFirstLast(row);
    return last === target.last && teamMatches(team, row["Team Name"] || "");
  });
  if (sameTeamLast.length !== 1) return null;
  return sameTeamLast[0]!;
}

function findEnrollmentMatch(
  enrollmentRows: EnrollmentRow[],
  playerFullName: string,
  team: string,
) {
  const target = rosterNameParts(playerFullName);

  const strict = enrollmentRows.filter((row) => {
    const rowName = enrollmentPlayerName(row);
    const { first, last } = enrollmentFirstLast(row);
    const nameMatch =
      rowName === target.full ||
      (first === target.first && last === target.last) ||
      (first === target.first && rowName.includes(target.last));
    return nameMatch && teamMatches(team, row["Team Name"] || "");
  });
  if (strict.length === 1) return strict[0]!;
  if (strict.length > 1) {
    const exactTeam = strict.find((row) => norm(row["Team Name"] || "") === norm(team));
    if (exactTeam) return exactTeam;
    return strict[0]!;
  }

  const lastNameMatches = enrollmentRows.filter((row) => {
    const { first, last } = enrollmentFirstLast(row);
    return first === target.first && last.startsWith(target.last.slice(0, 4));
  });
  if (lastNameMatches.length === 1) return lastNameMatches[0]!;

  return findNicknameEnrollmentMatch(enrollmentRows, playerFullName, team);
}

async function main() {
  const enrollmentPath = resolve(readArg("--enrollment") || "/tmp/Enrollment_Details.xlsx");
  const inPath = resolve(readArg("--in") || "exports/all-star-roster-contacts-all-orgs-2026.csv");
  const outPath = resolve(readArg("--out") || inPath);

  const workbook = XLSX.readFile(enrollmentPath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Enrollment workbook has no sheets.");
  const enrollmentRows = XLSX.utils.sheet_to_json<EnrollmentRow>(workbook.Sheets[sheetName]!, {
    defval: "",
  });

  const csv = readFileSync(inPath, "utf8");
  const table = parseCsv(csv);
  const header = table[0];
  if (!header) throw new Error("CSV header missing.");

  const idx = Object.fromEntries(header.map((name, index) => [name, index]));
  const required = [
    "Player Full Name",
    "Team",
    "Contact Email",
    "Guardian Email",
    "Guardian Phone",
    "Player Contact Phone",
    "Email Match Status",
  ];
  for (const col of required) {
    if (!(col in idx)) throw new Error(`Missing column: ${col}`);
  }

  let filled = 0;
  const stillMissing: string[] = [];

  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const row = table[rowIndex]!;
    if (row[idx["Email Match Status"]!] !== "not_found") continue;

    const player = row[idx["Player Full Name"]!] || "";
    const team = row[idx["Team"]!] || "";
    const match = findEnrollmentMatch(enrollmentRows, player, team);
    if (!match) {
      stillMissing.push(player);
      continue;
    }

    const email = String(match["User Email"] || "").trim();
    const phone = String(match["Cellphone"] || match["Telephone"] || match["Other Phone"] || "").trim();
    if (!email) {
      stillMissing.push(player);
      continue;
    }

    row[idx["Contact Email"]!] = email;
    row[idx["Guardian Email"]!] = email;
    if (phone) {
      row[idx["Guardian Phone"]!] = phone;
      row[idx["Player Contact Phone"]!] = phone;
    }
    row[idx["Email Match Status"]!] = "matched_enrollment";
    filled += 1;
  }

  const output = table.map((row) => row.map((cell) => escapeCsv(cell)).join(",")).join("\n");
  writeFileSync(outPath, output, "utf8");

  console.log(`Updated ${outPath}`);
  console.log(`Filled from enrollment: ${filled}`);
  console.log(`Still missing: ${stillMissing.length}`);
  for (const name of stillMissing) console.log(`  - ${name}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
