import * as XLSX from "xlsx";

import type { TournamentGameDraft } from "@/lib/assignr/gamesImportTypes";

const BLOCK_WIDTH = 5;
const BLOCK_GAP = 1;

const DATE_LABEL_PATTERN =
  /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?$/i;
const TIME_PATTERN = /^\d{1,2}:\d{2}\s*(?:AM|PM)$/i;
const TOURNAMENT_PATTERN = /tournament/i;
const PARK_HEADER_PATTERN = /^[A-Z][A-Z0-9\s-]{1,30}$/;

type ColumnBlock = {
  startColumn: number;
  tournamentLabel: string;
  currentDateLabel: string;
};

function cellValue(grid: string[][], row: number, column: number) {
  return grid[row]?.[column]?.trim() ?? "";
}

function normalizeGridValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isHeaderRow(grid: string[][], row: number, startColumn: number) {
  const game = cellValue(grid, row, startColumn).toLowerCase();
  const field = cellValue(grid, row, startColumn + 1).toLowerCase();
  const time = cellValue(grid, row, startColumn + 2).toLowerCase();
  return game === "game" && field.startsWith("field") && time === "time";
}

function isDateLabel(value: string) {
  return DATE_LABEL_PATTERN.test(value.trim());
}

function isTournamentLabel(value: string) {
  return Boolean(value.trim()) && TOURNAMENT_PATTERN.test(value);
}

function isParkHeader(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(",")) return false;
  if (isDateLabel(trimmed) || isTournamentLabel(trimmed)) return false;
  return PARK_HEADER_PATTERN.test(trimmed);
}

function findBlockStartForColumn(column: number) {
  const blockIndex = Math.floor(column / (BLOCK_WIDTH + BLOCK_GAP));
  return blockIndex * (BLOCK_WIDTH + BLOCK_GAP);
}

function parseDateLabel(label: string, seasonYear: number) {
  const cleaned = label
    .trim()
    .replace(/(\d{1,2})(st|nd|rd|th)/i, "$1");
  const parsed = new Date(`${cleaned} ${seasonYear}`);
  if (Number.isNaN(parsed.valueOf())) return null;
  return parsed;
}

export function formatAssignrDate(date: Date) {
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day} ${year}`;
}

export function formatAssignrTime(timeLabel: string) {
  const trimmed = timeLabel.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return trimmed;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  const date = new Date(Date.UTC(2026, 0, 1, hours, minutes));
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

export function sheetToGrid(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
    sheet,
    {
      header: 1,
      defval: "",
      raw: false,
    },
  );

  return rows.map((row) => row.map((value) => normalizeGridValue(value)));
}

export function workbookToGrid(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
  if (!firstSheet) {
    throw new Error("Unable to read uploaded sheet");
  }
  return sheetToGrid(firstSheet);
}

export function parseTournamentScheduleGrid(
  grid: string[][],
  seasonYear: number,
): TournamentGameDraft[] {
  const drafts: TournamentGameDraft[] = [];
  const blocks = new Map<number, ColumnBlock>();
  let parkSection = "";

  for (let row = 0; row < grid.length; row += 1) {
    const rowValues = grid[row] ?? [];
    const firstNonEmpty = rowValues.find((value) => value.trim())?.trim() ?? "";

    if (firstNonEmpty && isParkHeader(firstNonEmpty) && rowValues[1]?.trim() === "") {
      parkSection = firstNonEmpty;
    }

    for (let column = 0; column < rowValues.length; column += 1) {
      const value = cellValue(grid, row, column);
      if (!value) continue;

      if (isTournamentLabel(value)) {
        const startColumn = findBlockStartForColumn(column);
        const existing = blocks.get(startColumn);
        blocks.set(startColumn, {
          startColumn,
          tournamentLabel: value,
          currentDateLabel: existing?.currentDateLabel ?? "",
        });
        continue;
      }

      if (isDateLabel(value)) {
        const startColumn = findBlockStartForColumn(column);
        const existing = blocks.get(startColumn);
        if (existing) {
          blocks.set(startColumn, {
            ...existing,
            currentDateLabel: value,
          });
        } else {
          blocks.set(startColumn, {
            startColumn,
            tournamentLabel: "",
            currentDateLabel: value,
          });
        }
      }
    }

    const headerStarts = new Set<number>();
    for (let column = 0; column < rowValues.length; column += 1) {
      if (isHeaderRow(grid, row, column)) {
        headerStarts.add(column);
      }
    }

    for (const [startColumn, block] of blocks.entries()) {
      if (!block.tournamentLabel || !block.currentDateLabel) continue;

      const gameNumber = cellValue(grid, row, startColumn);
      const field = cellValue(grid, row, startColumn + 1);
      const time = cellValue(grid, row, startColumn + 2);
      const homeTeam = cellValue(grid, row, startColumn + 3);
      const awayTeam = cellValue(grid, row, startColumn + 4);

      if (headerStarts.has(startColumn)) continue;
      if (!gameNumber || !time || !TIME_PATTERN.test(time)) continue;
      if (!field || !homeTeam || !awayTeam) continue;
      if (!/^\d+$/.test(gameNumber)) continue;

      drafts.push({
        sourceTournament: block.tournamentLabel,
        sourcePark: parkSection,
        sourceField: field,
        dateLabel: block.currentDateLabel,
        time,
        homeTeam,
        awayTeam,
        sourceGameNumber: gameNumber,
        sourceRow: row + 1,
        sourceColumn: startColumn + 1,
      });
    }
  }

  return drafts;
}

export function parseTournamentScheduleBuffer(
  buffer: ArrayBuffer,
  seasonYear: number,
) {
  const grid = workbookToGrid(buffer);
  return parseTournamentScheduleGrid(grid, seasonYear);
}

export function dateLabelToAssignrDate(dateLabel: string, seasonYear: number) {
  const parsed = parseDateLabel(dateLabel, seasonYear);
  return parsed ? formatAssignrDate(parsed) : dateLabel.trim();
}
