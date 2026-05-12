import * as XLSX from "xlsx";

import { normalizeAgeGroup } from "@/lib/ageGroupAliases";
import { suggestParkVenue } from "@/lib/assignr/gamesImportAliases";
import { fieldMappingKey } from "@/lib/assignr/gamesImportTypes";
import type { VenueCatalogEntry } from "@/lib/assignr/gamesImportTypes";
import {
  buildSuggestedFieldMappings,
  buildVenueCatalog,
  listDistinctVenues,
  normalizeVenueLabel,
} from "@/lib/assignr/scheduleVenueCatalog";
import { inferContentOrgFromGame } from "@/lib/admin/assignrOrgScope";
import type { Game } from "@/lib/fetchGames";

export const SCORES_IMPORT_SEASON_START = "2026-03-01";
export const SCORES_IMPORT_SEASON_END = "2026-06-30";

const PREVIEW_SAMPLE_LIMIT = 25;

type CsvRow = Record<string, string | number | boolean | null | undefined>;

export type ScoresImportRow = {
  rowNumber: number;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  startTime: string;
  group: string;
  location: string;
  field: string;
  homeScoreRaw: string;
  awayScoreRaw: string;
};

export type ScoresFieldOption = {
  sourcePark: string;
  sourceField: string;
  key: string;
};

export type ScoresImportMappings = {
  parkMappings: Record<string, string>;
  fieldMappings: Record<string, string>;
  ageGroupMappings: Record<string, string>;
  rowMappings: Record<string, string>;
};

export type ScoresImportCandidateGame = {
  gameExternalId: string;
  ageGroup: string;
  homeTeam: string;
  awayTeam: string;
  dateLabel: string;
  startTime: string;
  reason: string;
};

export type ScoresImportUnmatchedRow = ScoresImportPreviewSample & {
  ageGroup: string;
  candidateGames: ScoresImportCandidateGame[];
  suggestedGameExternalId?: string;
};

export type ScoresImportSummary = {
  processed: number;
  matched: number;
  saved: number;
  unmatched: number;
  skippedMissingScore: number;
  skippedRainedOut: number;
};

export type ScoresImportPreviewSample = {
  rowNumber: number;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  startTime: string;
  location: string;
  field: string;
  ageGroup: string;
  homeScore: number | null;
  awayScore: number | null;
  outcome:
    | "matched"
    | "unmatched"
    | "skippedMissingScore"
    | "skippedRainedOut";
  matchedGameId?: string;
  matchedSubVenue?: string;
  reason?: string;
};

export type AssignrCancelledGameSummary = {
  gameExternalId: string;
  dateLabel: string;
  startTime: string;
  homeTeam: string;
  awayTeam: string;
  venue: string | null;
  subvenue: string | null;
  ageGroup: string | null;
};

export type ScoresImportPreview = {
  rowCount: number;
  parks: string[];
  fields: ScoresFieldOption[];
  venues: string[];
  venueCatalog: VenueCatalogEntry[];
  suggestedMappings: ScoresImportMappings;
  summary: Omit<ScoresImportSummary, "saved">;
  ageGroups: string[];
  importAgeGroups: string[];
  assignrCancelledGames: AssignrCancelledGameSummary[];
  excludedCancelledDates: string[];
  requiresCancelledAcknowledgement: boolean;
  unmatchedRows: ScoresImportUnmatchedRow[];
  cancelledRows: ScoresImportPreviewSample[];
  samples: {
    matched: ScoresImportPreviewSample[];
    unmatched: ScoresImportPreviewSample[];
    skippedMissingScore: ScoresImportPreviewSample[];
    skippedRainedOut: ScoresImportPreviewSample[];
  };
};

type GameIndexes = {
  byId: Map<string, Game>;
  byFallbackWithTime: Map<string, Game[]>;
  byFallback: Map<string, Game[]>;
};

type RowMatchResult =
  | {
      kind: "skippedMissingScore";
      row: ScoresImportRow;
    }
  | {
      kind: "unmatched";
      row: ScoresImportRow;
    }
  | {
      kind: "skippedRainedOut";
      row: ScoresImportRow;
      game: Game;
      homeScore: number;
      awayScore: number;
    }
  | {
      kind: "matched";
      row: ScoresImportRow;
      game: Game;
      homeScore: number;
      awayScore: number;
    };

export type SaveScoresImportRowPayload = {
  game: Game;
  row: ScoresImportRow;
  homeScore: number;
  awayScore: number;
  targetOrg: NonNullable<ReturnType<typeof inferContentOrgFromGame>>;
  gameDate: Date | null;
};

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getRowValue(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return String(row[key]).trim();
    }
  }
  return "";
}

function parseCsvDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = trimmed.match(mmddyyyy);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(dt.valueOf())) return dt;
  }

  const fallback = new Date(trimmed);
  if (Number.isNaN(fallback.valueOf())) return null;
  return fallback;
}

function parseCsvDateTime(dateValue: string, timeValue: string) {
  const date = parseCsvDate(dateValue);
  if (!date) return null;

  const trimmedTime = timeValue.trim();
  if (!trimmedTime) return date;

  const match = trimmedTime.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return date;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  const dt = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hours,
      minutes,
    ),
  );
  if (Number.isNaN(dt.valueOf())) return date;
  return dt;
}

function gameDateKeyFromString(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "";
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
}

function gameDateKeyFromDate(value: Date | null) {
  if (!value) return "";
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function gameTimeKeyFromString(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "";
  return `${String(parsed.getUTCHours()).padStart(2, "0")}:${String(parsed.getUTCMinutes()).padStart(2, "0")}`;
}

function gameTimeKeyFromDate(value: Date | null) {
  if (!value) return "";
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function toScore(value: string) {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

function buildFallbackKey(homeTeam: string, awayTeam: string, dateKey: string) {
  return `${normalizeText(homeTeam)}|${normalizeText(awayTeam)}|${dateKey}`;
}

function buildFallbackKeyWithTime(
  homeTeam: string,
  awayTeam: string,
  dateKey: string,
  timeKey: string,
) {
  return `${normalizeText(homeTeam)}|${normalizeText(awayTeam)}|${dateKey}|${timeKey}`;
}

function getGameSubVenue(game: Game) {
  return typeof game.subvenue === "string" ? game.subvenue.trim() : "";
}

function isAssignrCancelledGame(game: Game) {
  return game.status?.trim().toUpperCase() === "C";
}

function formatGameDateLabel(game: Game) {
  const source = game.start_time || game.localized_date;
  if (!source) return "Date TBD";
  const parsed = new Date(source);
  if (Number.isNaN(parsed.valueOf())) return "Date TBD";
  return parsed.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatGameStartTimeLabel(game: Game) {
  const source = game.start_time || game.localized_time;
  if (!source) return "";
  const parsed = new Date(source);
  if (Number.isNaN(parsed.valueOf())) return "";
  return parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function summarizeAssignrCancelledGame(game: Game): AssignrCancelledGameSummary {
  const venue =
    typeof game._embedded?.venue?.name === "string"
      ? game._embedded.venue.name.trim()
      : null;
  return {
    gameExternalId: String(game.id || "").trim(),
    dateLabel: formatGameDateLabel(game),
    startTime: formatGameStartTimeLabel(game),
    homeTeam: (game.home_team || "").trim() || "Home Team",
    awayTeam: (game.away_team || "").trim() || "Away Team",
    venue,
    subvenue: getGameSubVenue(game) || null,
    ageGroup:
      typeof game.age_group === "string" ? game.age_group.trim() || null : null,
  };
}

function collectUploadDateKeys(rows: ScoresImportRow[]) {
  const dateKeys = new Set<string>();
  for (const row of rows) {
    const dateKey = gameDateKeyFromDate(parseCsvDate(row.date));
    if (dateKey) dateKeys.add(dateKey);
  }
  return dateKeys;
}

function collectUploadMatchIds(rows: ScoresImportRow[]) {
  return new Set(
    rows.map((row) => row.matchId.trim()).filter(Boolean),
  );
}

export function listAssignrCancelledGamesForUpload(
  games: Game[],
  rows: ScoresImportRow[],
) {
  const uploadDateKeys = collectUploadDateKeys(rows);
  const uploadMatchIds = collectUploadMatchIds(rows);
  const seen = new Set<string>();
  const summaries: AssignrCancelledGameSummary[] = [];

  for (const game of games) {
    if (!isAssignrCancelledGame(game)) continue;
    const gameExternalId = String(game.id || "").trim();
    if (!gameExternalId || seen.has(gameExternalId)) continue;

    const dateKey =
      gameDateKeyFromString(game.start_time) ||
      gameDateKeyFromString(game.localized_date);
    const inUpload =
      uploadMatchIds.has(gameExternalId) ||
      (dateKey ? uploadDateKeys.has(dateKey) : false);
    if (!inUpload) continue;

    seen.add(gameExternalId);
    summaries.push(summarizeAssignrCancelledGame(game));
  }

  return summaries.sort((a, b) => {
    const dateCompare = a.dateLabel.localeCompare(b.dateLabel);
    if (dateCompare !== 0) return dateCompare;
    return a.startTime.localeCompare(b.startTime);
  });
}

export function collectExcludedCancelledDates(
  cancelledGames: AssignrCancelledGameSummary[],
) {
  return Array.from(
    new Set(
      cancelledGames
        .map((game) => game.dateLabel.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function rowDateKey(row: ScoresImportRow) {
  return gameDateKeyFromDate(parseCsvDate(row.date));
}

function rowMatchesCancelledUploadContext(
  row: ScoresImportRow,
  cancelledGames: AssignrCancelledGameSummary[],
) {
  const rowMatchId = row.matchId.trim();
  if (
    rowMatchId &&
    cancelledGames.some((game) => game.gameExternalId === rowMatchId)
  ) {
    return true;
  }

  const dateKey = rowDateKey(row);
  if (!dateKey) return false;

  return cancelledGames.some((game) => {
    const cancelledDateKey = gameDateKeyFromDate(parseCsvDate(game.dateLabel));
    return cancelledDateKey === dateKey;
  });
}

function pushGameIndex(map: Map<string, Game[]>, key: string, game: Game) {
  const current = map.get(key);
  if (current) {
    current.push(game);
    return;
  }
  map.set(key, [game]);
}

export function parseScoresImportBuffer(buffer: Buffer | ArrayBuffer) {
  const workbook = XLSX.read(buffer, {
    type: buffer instanceof Buffer ? "buffer" : "array",
  });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
  if (!firstSheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json<CsvRow>(firstSheet, {
    defval: "",
    raw: false,
  });
}

export function parseScoresImportRow(
  row: CsvRow,
  rowNumber: number,
): ScoresImportRow {
  return {
    rowNumber,
    matchId: getRowValue(row, ["Match ID", "match_id", "Game ID"]),
    homeTeam: getRowValue(row, ["Home Team", "home_team"]),
    awayTeam: getRowValue(row, ["Away Team", "away_team"]),
    date: getRowValue(row, ["Date", "Game Date", "game_date"]),
    startTime: getRowValue(row, ["Start Time", "Game Time", "start_time"]),
    group: getRowValue(row, ["Group Name", "Age Group", "age_group"]),
    location: getRowValue(row, ["Location", "location", "Park", "Venue"]),
    field: getRowValue(row, ["Field", "field", "Sub-Venue", "Sub Venue"]),
    homeScoreRaw: getRowValue(row, [
      "Home Team Score",
      "Home Score",
      "home_score",
    ]),
    awayScoreRaw: getRowValue(row, [
      "Away Team Score",
      "Away Score",
      "away_score",
    ]),
  };
}

export function collectDistinctParksFromRows(rows: ScoresImportRow[]) {
  return Array.from(
    new Set(rows.map((row) => row.location.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}

export function collectDistinctFieldsFromRows(rows: ScoresImportRow[]) {
  const seen = new Set<string>();
  const fields: ScoresFieldOption[] = [];

  for (const row of rows) {
    const sourcePark = row.location.trim();
    const sourceField = row.field.trim();
    if (!sourceField) continue;
    const key = fieldMappingKey(sourcePark, sourceField);
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ sourcePark, sourceField, key });
  }

  return fields.sort((a, b) => a.key.localeCompare(b.key));
}

export function collectDistinctAgeGroupsFromRows(rows: ScoresImportRow[]) {
  return Array.from(
    new Set(rows.map((row) => row.group.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}

export function listScheduleAgeGroups(games: Game[]) {
  return Array.from(
    new Set(
      games
        .map((game) =>
          typeof game.age_group === "string" ? game.age_group.trim() : "",
        )
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function normalizeAgeGroupKey(value: string) {
  return value.trim().toLowerCase();
}

export function buildSuggestedAgeGroupMappings(
  rows: ScoresImportRow[],
  scheduleAgeGroups: string[],
) {
  const mappings: Record<string, string> = {};

  for (const group of collectDistinctAgeGroupsFromRows(rows)) {
    const normalized = normalizeAgeGroup(group);
    const candidates = [normalized, group].filter(
      (value): value is string => Boolean(value?.trim()),
    );

    for (const candidate of candidates) {
      const exact = scheduleAgeGroups.find(
        (option) =>
          normalizeAgeGroupKey(option) === normalizeAgeGroupKey(candidate),
      );
      if (exact) {
        mappings[group] = exact;
        break;
      }
    }

    if (mappings[group]) continue;

    const loose = scheduleAgeGroups.find((option) => {
      const optionNorm = normalizeAgeGroupKey(option);
      const groupNorm = normalizeAgeGroupKey(group);
      return groupNorm.includes(optionNorm) || optionNorm.includes(groupNorm);
    });
    if (loose) {
      mappings[group] = loose;
    }
  }

  return mappings;
}

export function resolveMappedAgeGroup(
  row: ScoresImportRow,
  mappings: ScoresImportMappings,
) {
  const rawGroup = row.group.trim();
  if (!rawGroup) return null;
  const mapped = mappings.ageGroupMappings[rawGroup]?.trim();
  if (mapped) return mapped;
  return normalizeAgeGroup(rawGroup);
}

function teamNamesCompatible(csvTeam: string, gameTeam: string) {
  const csvNorm = normalizeText(csvTeam);
  const gameNorm = normalizeText(gameTeam);
  if (!csvNorm || !gameNorm) return false;
  return csvNorm === gameNorm || csvNorm.includes(gameNorm) || gameNorm.includes(csvNorm);
}

function ageGroupsCompatible(gameAgeGroup: string | undefined, mappedAgeGroup: string | null) {
  if (!mappedAgeGroup) return true;
  if (!gameAgeGroup?.trim()) return false;
  return (
    normalizeAgeGroupKey(gameAgeGroup) === normalizeAgeGroupKey(mappedAgeGroup)
  );
}

export function suggestCandidateGamesForRow(
  row: ScoresImportRow,
  games: Game[],
  mappings: ScoresImportMappings,
) {
  const mappedAgeGroup = resolveMappedAgeGroup(row, mappings);
  const dateKey = rowDateKey(row);
  const timeKey = gameTimeKeyFromDate(parseCsvDateTime(row.date, row.startTime));
  const scoredCandidates: Array<{ game: Game; score: number; reason: string }> = [];

  for (const game of games) {
    if (game.status?.trim().toUpperCase() !== "A") continue;

    let score = 0;
    const reasons: string[] = [];
    const gameDateKey =
      gameDateKeyFromString(game.start_time) ||
      gameDateKeyFromString(game.localized_date);
    const gameTimeKey =
      gameTimeKeyFromString(game.start_time) ||
      gameTimeKeyFromString(game.localized_time);

    if (dateKey && gameDateKey === dateKey) {
      score += 4;
      reasons.push("same date");
    }
    if (timeKey && gameTimeKey === timeKey) {
      score += 3;
      reasons.push("same start time");
    }
    if (
      row.homeTeam &&
      row.awayTeam &&
      teamNamesCompatible(row.homeTeam, game.home_team || "") &&
      teamNamesCompatible(row.awayTeam, game.away_team || "")
    ) {
      score += 6;
      reasons.push("same teams");
    } else if (
      row.homeTeam &&
      row.awayTeam &&
      teamNamesCompatible(row.homeTeam, game.away_team || "") &&
      teamNamesCompatible(row.awayTeam, game.home_team || "")
    ) {
      score += 4;
      reasons.push("teams swapped");
    } else if (
      row.homeTeam &&
      (teamNamesCompatible(row.homeTeam, game.home_team || "") ||
        teamNamesCompatible(row.homeTeam, game.away_team || ""))
    ) {
      score += 2;
      reasons.push("home team similar");
    } else if (
      row.awayTeam &&
      (teamNamesCompatible(row.awayTeam, game.away_team || "") ||
        teamNamesCompatible(row.awayTeam, game.home_team || ""))
    ) {
      score += 2;
      reasons.push("away team similar");
    }

    if (mappedAgeGroup && ageGroupsCompatible(game.age_group, mappedAgeGroup)) {
      score += 5;
      reasons.push("age group match");
    }

    if (row.matchId && String(game.id || "").trim() === row.matchId.trim()) {
      score += 8;
      reasons.push("match ID");
    }

    if (score < 4) continue;

    scoredCandidates.push({
      game,
      score,
      reason: reasons.join(", "),
    });
  }

  return scoredCandidates
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.game.id || "").localeCompare(String(b.game.id || ""));
    })
    .slice(0, 8)
    .map(({ game, reason }) => ({
      gameExternalId: String(game.id || "").trim(),
      ageGroup: (game.age_group || "Unassigned").trim() || "Unassigned",
      homeTeam: (game.home_team || "Home Team").trim(),
      awayTeam: (game.away_team || "Away Team").trim(),
      dateLabel: formatGameDateLabel(game),
      startTime: formatGameStartTimeLabel(game),
      reason,
    }));
}

export function buildSuggestedScoresMappings(params: {
  rows: ScoresImportRow[];
  venues: string[];
  venueCatalog: VenueCatalogEntry[];
  scheduleAgeGroups: string[];
}) {
  const parkMappings: Record<string, string> = {};
  for (const park of collectDistinctParksFromRows(params.rows)) {
    const suggestion = suggestParkVenue(park, params.venues);
    if (suggestion) {
      parkMappings[park] = suggestion;
    }
  }

  const fieldMappings = buildSuggestedFieldMappings({
    drafts: params.rows
      .filter((row) => row.field.trim())
      .map((row) => ({
        sourcePark: row.location.trim(),
        sourceField: row.field.trim(),
      })),
    parkMappings,
    catalog: params.venueCatalog,
  });
  const ageGroupMappings = buildSuggestedAgeGroupMappings(
    params.rows,
    params.scheduleAgeGroups,
  );

  return { parkMappings, fieldMappings, ageGroupMappings, rowMappings: {} };
}

export function buildScoresImportGameIndexes(games: Game[]): GameIndexes {
  const byId = new Map<string, Game>();
  const byFallbackWithTime = new Map<string, Game[]>();
  const byFallback = new Map<string, Game[]>();

  for (const game of games) {
    const gameId = String(game.id || "").trim();
    if (gameId) byId.set(gameId, game);

    const home = (game.home_team || "").trim();
    const away = (game.away_team || "").trim();
    const dateKey =
      gameDateKeyFromString(game.start_time) ||
      gameDateKeyFromString(game.localized_date);
    const timeKey =
      gameTimeKeyFromString(game.start_time) ||
      gameTimeKeyFromString(game.localized_time);
    if (home && away && dateKey) {
      pushGameIndex(byFallback, buildFallbackKey(home, away, dateKey), game);
      if (timeKey) {
        pushGameIndex(
          byFallbackWithTime,
          buildFallbackKeyWithTime(home, away, dateKey, timeKey),
          game,
        );
      }
    }
  }

  return { byId, byFallbackWithTime, byFallback };
}

export function resolveMappedSubVenue(
  row: ScoresImportRow,
  mappings: ScoresImportMappings,
) {
  const sourceField = row.field.trim();
  if (!sourceField) return null;
  const key = fieldMappingKey(row.location.trim(), sourceField);
  return mappings.fieldMappings[key]?.trim() || null;
}

function pickCandidateGame(
  candidates: Game[],
  params: {
    mappedAgeGroup: string | null;
    mappedSubVenue: string | null;
  },
) {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  if (params.mappedAgeGroup) {
    const filtered = candidates.filter((game) =>
      ageGroupsCompatible(game.age_group, params.mappedAgeGroup),
    );
    if (filtered.length === 1) return filtered[0];
    if (filtered.length > 1) {
      candidates = filtered;
    }
  }

  if (candidates.length === 1) return candidates[0];

  if (!params.mappedSubVenue) return undefined;

  const normalizedTarget = normalizeVenueLabel(params.mappedSubVenue);
  const filtered = candidates.filter(
    (game) => normalizeVenueLabel(getGameSubVenue(game)) === normalizedTarget,
  );
  if (filtered.length === 1) return filtered[0];
  return undefined;
}

export function matchScoresImportRow(params: {
  row: ScoresImportRow;
  indexes: GameIndexes;
  mappings: ScoresImportMappings;
}): RowMatchResult {
  const { row, indexes, mappings } = params;
  const homeScore = toScore(row.homeScoreRaw);
  const awayScore = toScore(row.awayScoreRaw);

  if (homeScore === null || awayScore === null) {
    return { kind: "skippedMissingScore", row };
  }

  const mappedSubVenue = resolveMappedSubVenue(row, mappings);
  const mappedAgeGroup = resolveMappedAgeGroup(row, mappings);
  const manualGameId = mappings.rowMappings[String(row.rowNumber)]?.trim();
  let game: Game | undefined;

  if (manualGameId) {
    game = indexes.byId.get(manualGameId);
  }

  if (!game && row.matchId) {
    game = indexes.byId.get(row.matchId);
  }

  if (!game && row.homeTeam && row.awayTeam) {
    const parsedDate = parseCsvDate(row.date);
    const dateKey = gameDateKeyFromDate(parsedDate);
    const dateTime = parseCsvDateTime(row.date, row.startTime);
    const timeKey = gameTimeKeyFromDate(dateTime);
    if (dateKey) {
      if (timeKey) {
        game = pickCandidateGame(
          indexes.byFallbackWithTime.get(
            buildFallbackKeyWithTime(row.homeTeam, row.awayTeam, dateKey, timeKey),
          ) ?? [],
          { mappedAgeGroup, mappedSubVenue },
        );
      }
      if (!game) {
        game = pickCandidateGame(
          indexes.byFallback.get(
            buildFallbackKey(row.homeTeam, row.awayTeam, dateKey),
          ) ?? [],
          { mappedAgeGroup, mappedSubVenue },
        );
      }
    }
  }

  if (!game) {
    return { kind: "unmatched", row };
  }

  const gameStatus = game.status?.trim().toUpperCase() || "";
  if (gameStatus !== "A") {
    return { kind: "skippedRainedOut", row, game, homeScore, awayScore };
  }

  const gameExternalId = String(game.id || "").trim();
  const targetOrg = inferContentOrgFromGame(game);
  if (!gameExternalId || !targetOrg) {
    return { kind: "unmatched", row };
  }

  return { kind: "matched", row, game, homeScore, awayScore };
}

function toPreviewSample(
  result: RowMatchResult,
  reason?: string,
): ScoresImportPreviewSample | null {
  const homeScore =
    result.kind === "skippedMissingScore"
      ? toScore(result.row.homeScoreRaw)
      : result.kind === "unmatched"
        ? toScore(result.row.homeScoreRaw)
        : result.homeScore;
  const awayScore =
    result.kind === "skippedMissingScore"
      ? toScore(result.row.awayScoreRaw)
      : result.kind === "unmatched"
        ? toScore(result.row.awayScoreRaw)
        : result.awayScore;

  const base = {
    rowNumber: result.row.rowNumber,
    matchId: result.row.matchId,
    homeTeam: result.row.homeTeam,
    awayTeam: result.row.awayTeam,
    date: result.row.date,
    startTime: result.row.startTime,
    location: result.row.location,
    field: result.row.field,
    ageGroup: result.row.group,
    homeScore,
    awayScore,
  };

  if (result.kind === "skippedMissingScore") {
    return { ...base, outcome: "skippedMissingScore" };
  }
  if (result.kind === "unmatched") {
    return { ...base, outcome: "unmatched", reason };
  }
  if (result.kind === "skippedRainedOut") {
    return {
      ...base,
      outcome: "skippedRainedOut",
      matchedGameId: String(result.game.id || ""),
      matchedSubVenue: getGameSubVenue(result.game) || undefined,
      reason: reason || "Assignr cancelled game",
    };
  }

  return {
    ...base,
    outcome: "matched",
    matchedGameId: String(result.game.id || ""),
    matchedSubVenue: getGameSubVenue(result.game) || undefined,
  };
}

function pushSample(
  bucket: ScoresImportPreviewSample[],
  sample: ScoresImportPreviewSample | null,
) {
  if (!sample || bucket.length >= PREVIEW_SAMPLE_LIMIT) return;
  bucket.push(sample);
}

function buildCancelledPreviewSample(
  row: ScoresImportRow,
  reason: string,
  game?: Game,
): ScoresImportPreviewSample {
  return {
    rowNumber: row.rowNumber,
    matchId: row.matchId,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    date: row.date,
    startTime: row.startTime,
    location: row.location,
    field: row.field,
    ageGroup: row.group,
    homeScore: toScore(row.homeScoreRaw),
    awayScore: toScore(row.awayScoreRaw),
    outcome: "skippedRainedOut",
    matchedGameId: game ? String(game.id || "") : undefined,
    matchedSubVenue: game ? getGameSubVenue(game) || undefined : undefined,
    reason,
  };
}

function shouldExcludeRowForAssignrCancellation(
  row: ScoresImportRow,
  cancelledGames: AssignrCancelledGameSummary[],
  indexes: GameIndexes,
) {
  const byId = row.matchId ? indexes.byId.get(row.matchId) : undefined;
  if (byId && isAssignrCancelledGame(byId)) {
    return {
      exclude: true,
      game: byId,
      reason: "Assignr cancelled game removed from import",
    };
  }

  if (!rowMatchesCancelledUploadContext(row, cancelledGames)) {
    return { exclude: false as const };
  }

  const homeScore = toScore(row.homeScoreRaw);
  const awayScore = toScore(row.awayScoreRaw);
  if (homeScore !== null && awayScore !== null) {
    return { exclude: false as const };
  }

  return {
    exclude: true,
    reason: "Assignr cancelled date removed from import",
  };
}

function buildUnmatchedPreviewRow(
  row: ScoresImportRow,
  games: Game[],
  mappings: ScoresImportMappings,
): ScoresImportUnmatchedRow {
  const candidateGames = suggestCandidateGamesForRow(row, games, mappings);
  const suggestedGameExternalId =
    candidateGames.length === 1 ? candidateGames[0]?.gameExternalId : undefined;

  return {
    rowNumber: row.rowNumber,
    matchId: row.matchId,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    date: row.date,
    startTime: row.startTime,
    location: row.location,
    field: row.field,
    ageGroup: row.group,
    homeScore: toScore(row.homeScoreRaw),
    awayScore: toScore(row.awayScoreRaw),
    outcome: "unmatched",
    reason: "No matching Assignr game for this row",
    candidateGames,
    suggestedGameExternalId,
  };
}

export function buildScoresImportPreview(params: {
  rows: CsvRow[];
  games: Game[];
  mappings?: ScoresImportMappings;
}): ScoresImportPreview {
  const parsedRows = params.rows.map((row, index) =>
    parseScoresImportRow(row, index + 2),
  );
  const venueCatalog = buildVenueCatalog(params.games);
  const venues = listDistinctVenues(venueCatalog);
  const ageGroups = listScheduleAgeGroups(params.games);
  const suggestedMappings = buildSuggestedScoresMappings({
    rows: parsedRows,
    venues,
    venueCatalog,
    scheduleAgeGroups: ageGroups,
  });
  const mappings = {
    parkMappings: {
      ...suggestedMappings.parkMappings,
      ...params.mappings?.parkMappings,
    },
    fieldMappings: {
      ...suggestedMappings.fieldMappings,
      ...params.mappings?.fieldMappings,
    },
    ageGroupMappings: {
      ...suggestedMappings.ageGroupMappings,
      ...params.mappings?.ageGroupMappings,
    },
    rowMappings: params.mappings?.rowMappings ?? {},
  };
  const indexes = buildScoresImportGameIndexes(params.games);
  const assignrCancelledGames = listAssignrCancelledGamesForUpload(
    params.games,
    parsedRows,
  );
  const excludedCancelledDates = collectExcludedCancelledDates(
    assignrCancelledGames,
  );

  const summary = {
    processed: 0,
    matched: 0,
    unmatched: 0,
    skippedMissingScore: 0,
    skippedRainedOut: 0,
  };
  const unmatchedRows: ScoresImportUnmatchedRow[] = [];
  const cancelledRows: ScoresImportPreviewSample[] = [];
  const samples = {
    matched: [] as ScoresImportPreviewSample[],
    unmatched: [] as ScoresImportPreviewSample[],
    skippedMissingScore: [] as ScoresImportPreviewSample[],
    skippedRainedOut: [] as ScoresImportPreviewSample[],
  };

  for (const row of parsedRows) {
    summary.processed += 1;
    const cancellation = shouldExcludeRowForAssignrCancellation(
      row,
      assignrCancelledGames,
      indexes,
    );
    if (cancellation.exclude) {
      summary.skippedRainedOut += 1;
      const sample = buildCancelledPreviewSample(
        row,
        cancellation.reason,
        cancellation.game,
      );
      cancelledRows.push(sample);
      pushSample(samples.skippedRainedOut, sample);
      continue;
    }

    const result = matchScoresImportRow({ row, indexes, mappings });
    const sample = toPreviewSample(
      result,
      result.kind === "unmatched"
        ? "No matching Assignr game for this row"
        : undefined,
    );

    if (result.kind === "skippedMissingScore") {
      summary.skippedMissingScore += 1;
      pushSample(samples.skippedMissingScore, sample);
      continue;
    }
    if (result.kind === "unmatched") {
      summary.unmatched += 1;
      const unmatchedRow = buildUnmatchedPreviewRow(row, params.games, mappings);
      unmatchedRows.push(unmatchedRow);
      pushSample(samples.unmatched, unmatchedRow);
      continue;
    }

    summary.matched += 1;
    if (result.kind === "skippedRainedOut") {
      summary.skippedRainedOut += 1;
      const cancelledSample = toPreviewSample(
        result,
        "Assignr cancelled game removed from import",
      );
      if (cancelledSample) cancelledRows.push(cancelledSample);
      pushSample(samples.skippedRainedOut, cancelledSample);
      continue;
    }

    pushSample(samples.matched, sample);
  }

  return {
    rowCount: parsedRows.length,
    parks: collectDistinctParksFromRows(parsedRows),
    fields: collectDistinctFieldsFromRows(parsedRows),
    venues,
    venueCatalog,
    suggestedMappings,
    summary,
    ageGroups,
    importAgeGroups: collectDistinctAgeGroupsFromRows(parsedRows),
    assignrCancelledGames,
    excludedCancelledDates,
    requiresCancelledAcknowledgement:
      assignrCancelledGames.length > 0 || cancelledRows.length > 0,
    unmatchedRows,
    cancelledRows,
    samples,
  };
}

export function buildSaveScoresImportPayload(
  result: Extract<RowMatchResult, { kind: "matched" }>,
): SaveScoresImportRowPayload | null {
  const parsedDateFromGame = result.game.start_time
    ? new Date(result.game.start_time)
    : result.game.localized_date
      ? new Date(result.game.localized_date)
      : null;
  const gameDate =
    parsedDateFromGame && !Number.isNaN(parsedDateFromGame.valueOf())
      ? parsedDateFromGame
      : null;
  const targetOrg = inferContentOrgFromGame(result.game);
  if (!targetOrg) return null;

  return {
    game: result.game,
    row: result.row,
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    targetOrg,
    gameDate,
  };
}

export async function applyScoresImport(params: {
  rows: CsvRow[];
  games: Game[];
  mappings?: ScoresImportMappings;
  saveRow: (payload: SaveScoresImportRowPayload) => Promise<void>;
}): Promise<ScoresImportSummary> {
  const parsedRows = params.rows.map((row, index) =>
    parseScoresImportRow(row, index + 2),
  );
  const venueCatalog = buildVenueCatalog(params.games);
  const venues = listDistinctVenues(venueCatalog);
  const ageGroups = listScheduleAgeGroups(params.games);
  const suggestedMappings = buildSuggestedScoresMappings({
    rows: parsedRows,
    venues,
    venueCatalog,
    scheduleAgeGroups: ageGroups,
  });
  const mappings = {
    parkMappings: {
      ...suggestedMappings.parkMappings,
      ...params.mappings?.parkMappings,
    },
    fieldMappings: {
      ...suggestedMappings.fieldMappings,
      ...params.mappings?.fieldMappings,
    },
    ageGroupMappings: {
      ...suggestedMappings.ageGroupMappings,
      ...params.mappings?.ageGroupMappings,
    },
    rowMappings: params.mappings?.rowMappings ?? {},
  };
  const indexes = buildScoresImportGameIndexes(params.games);
  const assignrCancelledGames = listAssignrCancelledGamesForUpload(
    params.games,
    parsedRows,
  );

  const summary: ScoresImportSummary = {
    processed: 0,
    matched: 0,
    saved: 0,
    unmatched: 0,
    skippedMissingScore: 0,
    skippedRainedOut: 0,
  };

  for (const row of parsedRows) {
    summary.processed += 1;
    const cancellation = shouldExcludeRowForAssignrCancellation(
      row,
      assignrCancelledGames,
      indexes,
    );
    if (cancellation.exclude) {
      summary.skippedRainedOut += 1;
      continue;
    }

    const result = matchScoresImportRow({ row, indexes, mappings });

    if (result.kind === "skippedMissingScore") {
      summary.skippedMissingScore += 1;
      continue;
    }
    if (result.kind === "unmatched") {
      summary.unmatched += 1;
      continue;
    }

    summary.matched += 1;
    if (result.kind === "skippedRainedOut") {
      summary.skippedRainedOut += 1;
      continue;
    }

    const payload = buildSaveScoresImportPayload(result);
    if (!payload) {
      summary.unmatched += 1;
      continue;
    }

    await params.saveRow(payload);
    summary.saved += 1;
  }

  return summary;
}
