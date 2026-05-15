import type { BracketGameRow } from "@/lib/tournament-brackets/bracketSpec";

export type IngestionProfile = "auto" | "xlsx_tournament_schedule";

export type IngestionResult = {
  warnings: string[];
  /** Suggested games merged into spec (caller merges). */
  games: BracketGameRow[];
  /** Optional plain text for model / user (PDF scrape, reference). */
  rawText?: string;
};

export function makeGameId(prefix: string, index: number) {
  return `${prefix}-${index}-${Math.random().toString(36).slice(2, 9)}`;
}
