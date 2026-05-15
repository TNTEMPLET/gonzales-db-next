import type { BracketGameRow } from "@/lib/tournament-brackets/bracketSpec";

import { ingestPdfStub } from "@/lib/tournament-brackets/ingestion/pdfStub";
import {
  inferMimeFromFilename,
  normalizeClientMime,
  sniffMimeFromBuffer,
} from "@/lib/tournament-brackets/ingestion/mime";
import type { IngestionProfile, IngestionResult } from "@/lib/tournament-brackets/ingestion/types";
import { ingestXlsxTournamentSchedule } from "@/lib/tournament-brackets/ingestion/xlsxProfile";

export type IngestBufferInput = {
  buffer: ArrayBuffer;
  mimeType: string;
  /** Improves MIME detection when `mimeType` is empty. */
  filename?: string;
  seasonYear: number;
  profile: IngestionProfile;
};

export async function ingestBracketBuffer(input: IngestBufferInput): Promise<IngestionResult> {
  const rawMime = normalizeClientMime(input.mimeType, input.filename ?? "");
  let mime = (rawMime || inferMimeFromFilename(input.filename ?? "")).toLowerCase();
  const warnings: string[] = [];

  const sniffed = sniffMimeFromBuffer(input.buffer);
  if (sniffed === "application/zip") {
    const fromName = inferMimeFromFilename(input.filename ?? "").toLowerCase();
    if (fromName.includes("spreadsheet") || fromName === "application/vnd.ms-excel") {
      mime = fromName;
    } else if (
      fromName === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fromName === "application/msword"
    ) {
      mime = fromName;
    }
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword"
  ) {
    warnings.push("Word documents (.doc/.docx) are not auto-parsed. Save as PDF or XLSX.");
    return { warnings, games: [] };
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel"
  ) {
    if (input.profile === "auto" || input.profile === "xlsx_tournament_schedule") {
      return ingestXlsxTournamentSchedule(input.buffer, input.seasonYear);
    }
  }

  if (mime === "application/pdf") {
    return ingestPdfStub(input.buffer);
  }

  warnings.push(`Unsupported file type for ingestion: ${mime || "(empty)"}`);
  return { warnings, games: [] };
}

export function mergeIngestionIntoGames(
  existing: BracketGameRow[],
  incoming: BracketGameRow[],
  mode: "replace" | "append",
): BracketGameRow[] {
  if (mode === "replace") return incoming;
  return [...existing, ...incoming];
}
