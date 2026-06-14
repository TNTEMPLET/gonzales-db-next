/**
 * Split Ascension 7U/8U LLB (not 8U MAJ) into a USSSA sheet in a multi-tab roster contacts workbook.
 *
 * Usage:
 *   npx tsx scripts/split-ascension-usssa-roster-contacts.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import * as XLSX from "xlsx";

const INPUT = resolve("exports/all-star-roster-contacts-all-orgs-2026-enriched.csv");
const XLSX_OUT = resolve("exports/all-star-roster-contacts-2026.xlsx");
const ASCENSION_CSV_OUT = resolve("exports/all-star-roster-contacts-ascension-2026.csv");
const USSSA_CSV_OUT = resolve("exports/all-star-roster-contacts-usssa-2026.csv");

type Row = Record<string, string>;

function parseCsv(content: string): Row[] {
  const table: string[][] = [];
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
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      table.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    table.push(row);
  }

  const header = table[0];
  if (!header?.length) return [];
  return table.slice(1).map((cells) =>
    Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])),
  );
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function rowsToCsv(rows: Row[]) {
  if (rows.length === 0) return "";
  const header = Object.keys(rows[0]!);
  return [
    header.map((cell) => escapeCsv(cell)).join(","),
    ...rows.map((row) => header.map((col) => escapeCsv(row[col] ?? "")).join(",")),
  ].join("\n");
}

/** 7U LLB and 8U LLB only — excludes 8U MAJ LLB and all other age groups. */
function isUsssaAgeGroup(ageGroup: string) {
  const age = ageGroup.trim().toUpperCase();
  if (age.includes("MAJ")) return false;
  return age === "7U LLB" || age === "8U LLB";
}

function cloneForUsssa(row: Row): Row {
  return { ...row, Organization: "usssa" };
}

function main() {
  const rows = parseCsv(readFileSync(INPUT, "utf8"));
  const gonzales = rows.filter((row) => row.Organization === "gonzales");
  const ascensionAll = rows.filter((row) => row.Organization === "ascension");

  const usssa = ascensionAll.filter((row) => isUsssaAgeGroup(row["Age Group"] || "")).map(cloneForUsssa);
  const ascension = ascensionAll.filter((row) => !isUsssaAgeGroup(row["Age Group"] || ""));

  writeFileSync(ASCENSION_CSV_OUT, rowsToCsv(ascension), "utf8");
  writeFileSync(USSSA_CSV_OUT, rowsToCsv(usssa), "utf8");

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(gonzales), "Gonzales");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ascension), "Ascension");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(usssa), "USSSA");
  XLSX.writeFile(workbook, XLSX_OUT);

  console.log(`Gonzales: ${gonzales.length}`);
  console.log(`Ascension (without 7U/8U LLB): ${ascension.length}`);
  console.log(`USSSA (7U + 8U LLB): ${usssa.length}`);
  console.log(`Wrote ${XLSX_OUT}`);
  console.log(`Wrote ${ASCENSION_CSV_OUT}`);
  console.log(`Wrote ${USSSA_CSV_OUT}`);
}

main();
