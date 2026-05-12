export type TournamentGameDraft = {
  sourceTournament: string;
  sourcePark: string;
  sourceField: string;
  dateLabel: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  sourceGameNumber: string;
  sourceRow: number;
  sourceColumn: number;
};

export type AssignrGameImportRow = {
  gameId: string;
  date: string;
  time: string;
  venue: string;
  subVenue: string;
  ageGroup: string;
  gender: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  gameType: string;
  pattern: string;
  paidBy: string;
  assignorName: string;
  notes: string;
  assignorNotes: string;
};

export type VenueCatalogEntry = {
  venue: string;
  subVenue: string;
};

export type FieldMappingKey = {
  sourcePark: string;
  sourceField: string;
};

export function fieldMappingKey(sourcePark: string, sourceField: string) {
  return `${sourcePark.trim().toLowerCase()}::${sourceField.trim().toLowerCase()}`;
}

export const ASSIGNR_GAMES_IMPORT_HEADERS = [
  "Game ID",
  "Date",
  "Time",
  "Venue",
  "Sub-Venue",
  "Age Group",
  "Gender",
  "Home Team",
  "Away Team",
  "League",
  "Game Type",
  "Pattern",
  "Paid By",
  "Assignor Name",
  "Notes",
  "Assignor Notes",
] as const;
