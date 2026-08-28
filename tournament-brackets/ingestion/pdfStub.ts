import { PDFDocument } from "pdf-lib";

import type { IngestionResult } from "@/lib/tournament-brackets/ingestion/types";

/** pdf-lib loads the document but does not extract text; guide user to image/XLSX. */
export async function ingestPdfStub(buffer: ArrayBuffer): Promise<IngestionResult> {
  const warnings: string[] = [];
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const n = doc.getPageCount();
    if (n === 0) warnings.push("PDF has no pages.");
    else {
      warnings.push(
        `Loaded PDF (${n} page(s)). Automatic text extraction is not available — export the tournament schedule as XLSX from your scoring software, then import that file.`,
      );
    }
    return { warnings, games: [] };
  } catch (e) {
    warnings.push(`Could not read PDF: ${e instanceof Error ? e.message : String(e)}`);
    return { warnings, games: [] };
  }
}
