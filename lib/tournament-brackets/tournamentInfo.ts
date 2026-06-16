import type { BracketTournamentInfo } from "@/lib/tournament-brackets/bracketSpec";

export const TOURNAMENT_INFO_FIELD_LABELS = {
  division: "Division",
  sites: "Site(s)",
  updatePhone: "Update Phone",
  tournamentDirector: "Tournament Director",
  nextLevel: "Next Level",
} as const satisfies Record<keyof BracketTournamentInfo, string>;

export type TournamentInfoRow = {
  key: keyof BracketTournamentInfo;
  label: string;
  value: string;
};

export function tournamentInfoRows(info?: BracketTournamentInfo | null): TournamentInfoRow[] {
  if (!info) return [];
  const rows: TournamentInfoRow[] = [];
  for (const key of Object.keys(TOURNAMENT_INFO_FIELD_LABELS) as (keyof BracketTournamentInfo)[]) {
    const value = info[key]?.trim();
    if (!value) continue;
    rows.push({ key, label: TOURNAMENT_INFO_FIELD_LABELS[key], value });
  }
  return rows;
}

export function hasBracketTournamentInfo(info?: BracketTournamentInfo | null): boolean {
  return tournamentInfoRows(info).length > 0;
}

export function normalizeBracketTournamentInfo(
  raw?: BracketTournamentInfo | null,
): BracketTournamentInfo | undefined {
  if (!raw) return undefined;
  const next: BracketTournamentInfo = {};
  for (const key of Object.keys(TOURNAMENT_INFO_FIELD_LABELS) as (keyof BracketTournamentInfo)[]) {
    const value = raw[key]?.trim();
    if (value) next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
