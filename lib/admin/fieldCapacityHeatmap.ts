import { parseCellDivisions } from "./fieldBoardWeek";
import { parseUtcDateOnly } from "@/lib/scheduler/seasonWindows";
import { dateKey } from "@/lib/scheduler/validation";

export type HeatmapAvailability = {
  availabilityType: "AVAILABLE" | "BLACKOUT";
  date: string | Date | null;
  dayOfWeek: number | null;
  startTime: string | null;
  fieldId: string | null;
  parkId: string;
  notes: string | null;
};

export type HeatmapField = {
  id: string;
  parkId: string;
  name: string;
  shortName: string | null;
  isActive: boolean;
};

export type HeatmapPark = {
  id: string;
  name: string;
  shortName: string | null;
  fields: HeatmapField[];
  availabilities: HeatmapAvailability[];
};

export type HeatmapGame = {
  fieldId: string | null;
  gameDate: string | Date | null;
  startTime: string | null;
  division: string;
  homeTeamName: string;
  awayTeamName: string;
};

export type HeatmapCellStatus = "booked" | "open" | "dark";

export type HeatmapCell = {
  status: HeatmapCellStatus;
  divisions: string[];
  game: { division: string; homeTeamName: string; awayTeamName: string } | null;
};

export type HeatmapColumn = {
  fieldId: string;
  label: string;
  parkLabel: string;
};

export type HeatmapRow = {
  date: string;
  startTime: string;
  dayLabel: string;
};

export type FieldCapacityHeatmap = {
  columns: HeatmapColumn[];
  rows: HeatmapRow[];
  cells: Record<string, HeatmapCell>;
  booked: number;
  open: number;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function heatmapCellKey(date: string, startTime: string, fieldId: string): string {
  return `${date}|${startTime}|${fieldId}`;
}

function isoDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return dateKey(value);
}

function enumerateDateKeys(start: string, end: string): string[] {
  const first = parseUtcDateOnly(start);
  const last = parseUtcDateOnly(end);
  if (!first || !last || first > last) return [];
  const keys: string[] = [];
  const cursor = new Date(first);
  while (cursor <= last) {
    keys.push(dateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function utcDayOfWeek(dateKeyValue: string): number {
  const parsed = parseUtcDateOnly(dateKeyValue);
  return parsed ? parsed.getUTCDay() : -1;
}

function formatDayLabel(dateKeyValue: string): string {
  const day = utcDayOfWeek(dateKeyValue);
  return DAY_LABELS[day] ?? "";
}

function fieldIdsForAvailability(availability: HeatmapAvailability, park: HeatmapPark): string[] {
  if (availability.fieldId) return [availability.fieldId];
  return park.fields.filter((field) => field.isActive).map((field) => field.id);
}

function datesForAvailability(availability: HeatmapAvailability, windowDates: string[]): string[] {
  if (availability.date) {
    const key = isoDate(availability.date);
    return key && windowDates.includes(key) ? [key] : key ? [key] : [];
  }
  if (availability.dayOfWeek == null) return [];
  return windowDates.filter((key) => utcDayOfWeek(key) === availability.dayOfWeek);
}

export function buildFieldCapacityHeatmap(params: {
  parks: HeatmapPark[];
  gamesStartsOn: string;
  gamesEndsOn: string;
  games: HeatmapGame[];
}): FieldCapacityHeatmap {
  const windowDates = enumerateDateKeys(params.gamesStartsOn, params.gamesEndsOn);
  const fieldsById = new Map<string, { field: HeatmapField; park: HeatmapPark }>();
  for (const park of params.parks) {
    for (const field of park.fields) {
      if (!field.isActive) continue;
      fieldsById.set(field.id, { field, park });
    }
  }

  const open = new Map<string, string[]>();
  const blackouts = new Set<string>();

  for (const park of params.parks) {
    for (const availability of park.availabilities) {
      if (!availability.startTime) continue;
      const fieldIds = fieldIdsForAvailability(availability, park).filter((id) => fieldsById.has(id));
      const dates = datesForAvailability(availability, windowDates);
      for (const date of dates) {
        for (const fieldId of fieldIds) {
          const key = heatmapCellKey(date, availability.startTime, fieldId);
          if (availability.availabilityType === "BLACKOUT") {
            blackouts.add(key);
            continue;
          }
          const divisions = parseCellDivisions(availability.notes);
          const existing = open.get(key) ?? [];
          open.set(key, [...new Set([...existing, ...divisions])]);
        }
      }
    }
  }

  for (const key of blackouts) open.delete(key);

  const gamesByCell = new Map<string, HeatmapCell["game"]>();
  for (const game of params.games) {
    const date = isoDate(game.gameDate);
    if (!game.fieldId || !date || !game.startTime) continue;
    if (!fieldsById.has(game.fieldId)) continue;
    const key = heatmapCellKey(date, game.startTime, game.fieldId);
    if (!gamesByCell.has(key)) {
      gamesByCell.set(key, {
        division: game.division,
        homeTeamName: game.homeTeamName,
        awayTeamName: game.awayTeamName,
      });
    }
    if (!open.has(key)) open.set(key, parseCellDivisions(game.division));
  }

  const rowKeys = new Set<string>();
  const fieldIds = new Set<string>();
  for (const key of open.keys()) {
    const [date, startTime, fieldId] = key.split("|");
    rowKeys.add(`${date}|${startTime}`);
    fieldIds.add(fieldId);
  }

  const columns: HeatmapColumn[] = [...fieldIds]
    .map((fieldId) => {
      const entry = fieldsById.get(fieldId);
      if (!entry) return null;
      return {
        fieldId,
        label: entry.field.shortName || entry.field.name,
        parkLabel: entry.park.shortName || entry.park.name,
      };
    })
    .filter((column): column is HeatmapColumn => Boolean(column))
    .sort((a, b) => a.parkLabel.localeCompare(b.parkLabel) || a.label.localeCompare(b.label));

  const rows: HeatmapRow[] = [...rowKeys]
    .map((key) => {
      const [date, startTime] = key.split("|");
      return { date, startTime, dayLabel: formatDayLabel(date) };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const cells: Record<string, HeatmapCell> = {};
  let booked = 0;
  let openCount = 0;
  for (const row of rows) {
    for (const column of columns) {
      const key = heatmapCellKey(row.date, row.startTime, column.fieldId);
      const game = gamesByCell.get(key) ?? null;
      const divisions = open.get(key);
      if (game) {
        cells[key] = { status: "booked", divisions: divisions ?? [game.division], game };
        booked += 1;
      } else if (divisions) {
        cells[key] = { status: "open", divisions, game: null };
        openCount += 1;
      } else {
        cells[key] = { status: "dark", divisions: [], game: null };
      }
    }
  }

  return { columns, rows, cells, booked, open: openCount };
}

export function heatmapCellLabel(cell: HeatmapCell): string {
  if (cell.status === "booked" && cell.game) {
    return `${cell.game.division} · ${cell.game.homeTeamName} vs ${cell.game.awayTeamName}`;
  }
  if (cell.status === "open") {
    return cell.divisions.length ? `Open · ${cell.divisions.join(", ")}` : "Open";
  }
  return "Dark";
}

export type DivisionCapacityRow = {
  division: string;
  teams: number;
  games: number;
  slotted: number;
  needed: number;
  boardSlots: number;
};

export function targetGamesForDivision(teams: number, gamesPerTeam: number): number {
  if (teams < 2 || gamesPerTeam < 1) return 0;
  return Math.floor((teams * gamesPerTeam) / 2);
}

function gameIsSlotted(game: HeatmapGame): boolean {
  return Boolean(isoDate(game.gameDate) && game.fieldId && game.startTime);
}

export function buildDivisionCapacitySummary(params: {
  grid: FieldCapacityHeatmap;
  games: HeatmapGame[];
  teamCounts: Record<string, number>;
  gamesPerTeam: number;
}): DivisionCapacityRow[] {
  const boardByDivision = new Map<string, number>();
  const tagged = new Set<string>();
  for (const cell of Object.values(params.grid.cells)) {
    if (cell.status === "dark") continue;
    const divisions = cell.divisions.length
      ? cell.divisions
      : cell.game
        ? [cell.game.division]
        : [];
    for (const division of divisions) {
      tagged.add(division);
      boardByDivision.set(division, (boardByDivision.get(division) ?? 0) + 1);
    }
  }

  const gamesByDivision = new Map<string, HeatmapGame[]>();
  for (const game of params.games) {
    if (!game.division) continue;
    const list = gamesByDivision.get(game.division) ?? [];
    list.push(game);
    gamesByDivision.set(game.division, list);
  }

  const divisions = new Set<string>([
    ...Object.keys(params.teamCounts),
    ...gamesByDivision.keys(),
    ...tagged,
  ]);

  const rows: DivisionCapacityRow[] = [];
  for (const division of divisions) {
    const teams = params.teamCounts[division] ?? 0;
    const list = gamesByDivision.get(division) ?? [];
    const slotted = list.filter(gameIsSlotted).length;
    const target = targetGamesForDivision(teams, params.gamesPerTeam);
    const games = list.length || target;
    if (!teams && !games && !(boardByDivision.get(division) ?? 0)) continue;
    rows.push({
      division,
      teams,
      games,
      slotted,
      needed: Math.max(0, games - slotted),
      boardSlots: boardByDivision.get(division) ?? 0,
    });
  }
  return rows;
}
