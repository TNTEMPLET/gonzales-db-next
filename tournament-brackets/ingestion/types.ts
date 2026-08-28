import type { BracketGameRow } from "@/lib/tournament-brackets/bracketSpec";
import type { PdfBracketTemplateMatch } from "@/lib/tournament-brackets/ingestion/parsePdfBracketTemplate";

export type IngestionProfile =
  | "auto"
  | "xlsx_tournament_schedule"
  | "pdf_ocr"
  | "pdf_vision";

export type IngestionResult = {
  warnings: string[];
  /** Suggested games merged into spec (caller merges). */
  games: BracketGameRow[];
  /** Optional plain text for model / user (PDF scrape, reference). */
  rawText?: string;
  /** Recognized governing-body PDF bracket template (wizard pre-fill). */
  pdfTemplate?: PdfBracketTemplateMatch;
  /** Partial spec fields to merge after PDF template detection. */
  specPatch?: Record<string, unknown>;
  /** Stored artifact URL when ingest also persisted the upload. */
  artifactUrl?: string;
  /** Number of structured bracket games built from PDF routing (Phase 2). */
  roundsBuilt?: number;
};

export function makeGameId(prefix: string, index: number) {
  return `${prefix}-${index}-${Math.random().toString(36).slice(2, 9)}`;
}
