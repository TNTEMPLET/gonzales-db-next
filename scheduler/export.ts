import { dateKey } from "./validation";

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
  return Array.isArray(value) ? value.join(";") : "";
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
