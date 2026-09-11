import * as XLSX from "xlsx";

import { ASSIGNR_GAMES_IMPORT_HEADERS } from "@/lib/assignr/gamesImportTypes";
import { STANDARD_DIVISIONS } from "@/lib/sportsConnect/fallballDivisions";
import { formatConflictSummary } from "./conflictCopy";
import { assignrUmpirePattern } from "./umpirePattern";
import { dateKey, timeToMinutes } from "./validation";

export type SchedulerExportGame = {
  gameNumber: number | null;
  gameDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  division: string;
  ageGroup: string | null;
  homeTeamName: string;
  awayTeamName: string;
  park?: { name: string; shortName: string | null } | null;
  field?: { name: string; shortName: string | null } | null;
  status: string;
  conflictFlags: unknown;
  schedulerNotes: string | null;
};

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function conflictText(value: unknown): string {
  return formatConflictSummary(value, "");
}

export function exportDraftGamesCsv(games: SchedulerExportGame[]): string {
  const headers = [
    "Game Number",
    "Date",
    "Start Time",
    "End Time",
    "Division",
    "Age Group",
    "Home Team",
    "Away Team",
    "Park",
    "Field",
    "Status",
    "Conflict Flags",
    "Scheduler Notes",
  ];
  const rows = games.map((game) => [
    game.gameNumber ?? "",
    game.gameDate ? dateKey(game.gameDate) : "",
    game.startTime ?? "",
    game.endTime ?? "",
    game.division,
    game.ageGroup ?? "",
    game.homeTeamName,
    game.awayTeamName,
    game.park?.shortName || game.park?.name || "",
    game.field?.shortName || game.field?.name || "",
    game.status,
    conflictText(game.conflictFlags),
    game.schedulerNotes ?? "",
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function formatAmPm(time: string | null | undefined): string {
  const minutes = timeToMinutes(time);
  if (minutes === null) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${((hours + 11) % 12) + 1}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function formatUsDate(date: Date): string {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
}

function formatAssignrDate(date: Date): string {
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${date.getUTCDate()} ${date.getUTCFullYear()}`;
}

function durationMinutes(start: string | null | undefined, end: string | null | undefined): number {
  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  if (from === null || to === null || to <= from) return 90;
  return to - from;
}

function parkName(game: SchedulerExportGame): string {
  return game.park?.name || game.park?.shortName || "";
}

function fieldName(game: SchedulerExportGame): string {
  return game.field?.name || game.field?.shortName || "";
}

function placedGames(games: SchedulerExportGame[]): SchedulerExportGame[] {
  return games.filter((game) => Boolean(game.gameDate && game.startTime && game.homeTeamName && game.awayTeamName));
}

function assignrSheet(games: SchedulerExportGame[], leagueName: string): unknown[][] {
  return [
    [...ASSIGNR_GAMES_IMPORT_HEADERS],
    ...placedGames(games).map((game) => [
      "",
      game.gameDate ? formatAssignrDate(game.gameDate) : "",
      formatAmPm(game.startTime),
      parkName(game),
      fieldName(game),
      game.division,
      "",
      game.homeTeamName,
      game.awayTeamName,
      leagueName,
      "Regular",
      assignrUmpirePattern(game.division),
      "",
      "",
      game.schedulerNotes ?? "",
      "",
    ]),
  ];
}

function sportsConnectSheet(games: SchedulerExportGame[]): unknown[][] {
  return [
    ["Date", "Start Time", "End Time", "Home Team", "Away Team", "Location", "Field"],
    ...placedGames(games).map((game) => [
      game.gameDate ? formatUsDate(game.gameDate) : "",
      formatAmPm(game.startTime),
      formatAmPm(game.endTime),
      game.homeTeamName,
      game.awayTeamName,
      parkName(game),
      fieldName(game),
    ]),
  ];
}

function excelSheetName(raw: string, used: Set<string>): string {
  const cleaned = raw.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim() || "Division";
  let name = cleaned.slice(0, 31);
  let n = 2;
  while (used.has(name)) {
    const suffix = ` ${n}`;
    name = `${cleaned.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(name);
  return name;
}

function sportsConnectDivisions(games: SchedulerExportGame[]): string[] {
  const present = [...new Set(placedGames(games).map((game) => game.division).filter(Boolean))];
  const rank = new Map(STANDARD_DIVISIONS.map((division, index) => [division, index]));
  return present.sort((a, b) => {
    const aRank = rank.get(a as (typeof STANDARD_DIVISIONS)[number]);
    const bRank = rank.get(b as (typeof STANDARD_DIVISIONS)[number]);
    if (aRank != null && bRank != null) return aRank - bRank;
    if (aRank != null) return -1;
    if (bRank != null) return 1;
    return a.localeCompare(b);
  });
}

function gameChangerSheet(games: SchedulerExportGame[]): unknown[][] {
  return [
    ["division", "date", "time", "home", "away", "location", "duration"],
    ...placedGames(games).map((game) => {
      const location = [parkName(game), fieldName(game)].filter(Boolean).join(" - ");
      return [
        game.division,
        game.gameDate ? formatUsDate(game.gameDate) : "",
        formatAmPm(game.startTime),
        game.homeTeamName,
        game.awayTeamName,
        location,
        durationMinutes(game.startTime, game.endTime),
      ];
    }),
  ];
}

export function exportVendorWorkbook(
  games: SchedulerExportGame[],
  options?: { leagueName?: string },
): Buffer {
  const workbook = XLSX.utils.book_new();
  const leagueName = options?.leagueName?.trim() || "AP Fall Ball";
  const usedNames = new Set<string>(["Assignr", "GameChanger"]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(assignrSheet(games, leagueName)), "Assignr");
  for (const division of sportsConnectDivisions(games)) {
    const rows = sportsConnectSheet(placedGames(games).filter((game) => game.division === division));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), excelSheetName(division, usedNames));
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(gameChangerSheet(games)), "GameChanger");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
