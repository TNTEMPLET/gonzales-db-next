import type {
  AssignrGameImportRow,
  TournamentGameDraft,
} from "@/lib/assignr/gamesImportTypes";
import {
  ASSIGNR_GAMES_IMPORT_HEADERS,
  fieldMappingKey,
} from "@/lib/assignr/gamesImportTypes";
import {
  dateLabelToAssignrDate,
  formatAssignrTime,
} from "@/lib/assignr/tournamentScheduleParser";

export type GamesImportMappingInput = {
  ageGroupMappings: Record<string, string>;
  parkMappings: Record<string, string>;
  fieldMappings: Record<string, string>;
  league?: string;
  gameType?: string;
  includeSourceNotes?: boolean;
};

export type MappedGameImportResult = {
  row: AssignrGameImportRow;
  warnings: string[];
  skipped: boolean;
};

function escapeCsvValue(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function mapDraftToAssignrRow(
  draft: TournamentGameDraft,
  mappings: GamesImportMappingInput,
  seasonYear: number,
): MappedGameImportResult {
  const warnings: string[] = [];
  const ageGroup = mappings.ageGroupMappings[draft.sourceTournament.trim()]?.trim();
  const venue = mappings.parkMappings[draft.sourcePark.trim()]?.trim();
  const fieldKey = fieldMappingKey(draft.sourcePark, draft.sourceField);
  const subVenue = mappings.fieldMappings[fieldKey]?.trim();

  if (!ageGroup) warnings.push("Missing age group mapping");
  if (!venue) warnings.push("Missing venue mapping");
  if (!subVenue) warnings.push("Missing sub-venue mapping");

  const notes =
    mappings.includeSourceNotes === false
      ? ""
      : `Tournament: ${draft.sourceTournament}; Game: ${draft.sourceGameNumber}`;

  const row: AssignrGameImportRow = {
    gameId: "",
    date: dateLabelToAssignrDate(draft.dateLabel, seasonYear),
    time: formatAssignrTime(draft.time),
    venue: venue ?? "",
    subVenue: subVenue ?? "",
    ageGroup: ageGroup ?? "",
    gender: "",
    homeTeam: draft.homeTeam,
    awayTeam: draft.awayTeam,
    league: mappings.league?.trim() ?? "",
    gameType: mappings.gameType?.trim() ?? "",
    pattern: "",
    paidBy: "",
    assignorName: "",
    notes,
    assignorNotes: "",
  };

  return {
    row,
    warnings,
    skipped: warnings.length > 0,
  };
}

export function mapDraftsToAssignrRows(
  drafts: TournamentGameDraft[],
  mappings: GamesImportMappingInput,
  seasonYear: number,
) {
  return drafts.map((draft) => mapDraftToAssignrRow(draft, mappings, seasonYear));
}

export function assignrRowToCsvCells(row: AssignrGameImportRow) {
  return [
    row.gameId,
    row.date,
    row.time,
    row.venue,
    row.subVenue,
    row.ageGroup,
    row.gender,
    row.homeTeam,
    row.awayTeam,
    row.league,
    row.gameType,
    row.pattern,
    row.paidBy,
    row.assignorName,
    row.notes,
    row.assignorNotes,
  ];
}

export function buildAssignrGamesCsv(rows: AssignrGameImportRow[]) {
  const lines = [
    ASSIGNR_GAMES_IMPORT_HEADERS.join(","),
    ...rows.map((row) =>
      assignrRowToCsvCells(row).map((value) => escapeCsvValue(value)).join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function buildAssignrGamesCsvFromDrafts(
  drafts: TournamentGameDraft[],
  mappings: GamesImportMappingInput,
  seasonYear: number,
  options?: { includeUnmapped?: boolean },
) {
  const mapped = mapDraftsToAssignrRows(drafts, mappings, seasonYear);
  const rows = mapped
    .filter((entry) => options?.includeUnmapped || !entry.skipped)
    .map((entry) => entry.row);
  return {
    csv: buildAssignrGamesCsv(rows),
    mapped,
    exportedCount: rows.length,
    skippedCount: mapped.filter((entry) => entry.skipped).length,
  };
}
