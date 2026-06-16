import { extractPdfText, extractPdfTextHeuristic } from "@/lib/tournament-brackets/ingestion/extractPdfText";
import {
  bracketPdfOcrEnabled,
  bracketPdfVisionApiKey,
  mergePdfTextLayers,
  pdfTextIsWeakForBracketIngest,
  resolveBracketPdfVisualReaderMode,
  type BracketPdfVisualReaderMode,
} from "@/lib/tournament-brackets/ingestion/bracketPdfVisualReaderConfig";
import { ocrPdfBuffer } from "@/lib/tournament-brackets/ingestion/ocrPdfText";
import { visionReadPdfBuffer } from "@/lib/tournament-brackets/ingestion/visionReadPdfText";

export type PdfTextExtractionSource = "embedded" | "heuristic" | "ocr" | "vision" | "merged";

export type PdfTextExtraction = {
  text: string;
  source: PdfTextExtractionSource;
  embeddedText: string;
  ocrText?: string;
  visionText?: string;
  warnings: string[];
};

export type ExtractPdfTextForIngestOptions = {
  mode?: BracketPdfVisualReaderMode;
};

/**
 * Extract bracket-relevant text from a PDF for ingest.
 * 1. Embedded PDF strings (pdf-parse + parenthesis heuristic) — fast, works for DocHub exports.
 * 2. OCR (Tesseract) — scanned / flat PDFs when text layer is weak.
 * 3. Vision API — optional cloud fallback when OCR is weak and BRACKET_PDF_VISION_API_KEY is set.
 */
export async function extractPdfTextForIngest(
  buffer: ArrayBuffer,
  opts?: ExtractPdfTextForIngestOptions,
): Promise<PdfTextExtraction> {
  const warnings: string[] = [];
  const mode = opts?.mode ?? resolveBracketPdfVisualReaderMode();

  let embeddedText = "";
  try {
    embeddedText = await extractPdfText(buffer);
  } catch (e) {
    warnings.push(
      `Embedded PDF text extraction failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!embeddedText.trim()) {
    embeddedText = extractPdfTextHeuristic(buffer);
  }

  const embeddedSource: PdfTextExtractionSource = embeddedText.trim() ? "embedded" : "heuristic";
  let ocrText: string | undefined;
  let visionText: string | undefined;

  const weakEmbedded = pdfTextIsWeakForBracketIngest(embeddedText);

  if (mode === "off") {
    if (weakEmbedded && embeddedText.trim()) {
      warnings.push(
        "Embedded PDF text may be incomplete for bracket routing. Set BRACKET_PDF_VISUAL_READER=auto to enable OCR/vision fallback.",
      );
    }
    return {
      text: embeddedText,
      source: embeddedSource,
      embeddedText,
      warnings,
    };
  }

  const shouldOcr =
    mode === "ocr" || (mode === "auto" && bracketPdfOcrEnabled() && weakEmbedded);
  const shouldVision =
    mode === "vision" ||
    (mode === "auto" && weakEmbedded && bracketPdfVisionApiKey());

  if (shouldOcr || mode === "ocr") {
    try {
      ocrText = await ocrPdfBuffer(buffer);
      if (ocrText.trim()) {
        warnings.push("Applied local OCR (Tesseract) to read bracket text from the PDF image.");
      } else {
        warnings.push("OCR ran but returned no readable text.");
      }
    } catch (e) {
      warnings.push(`OCR failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const mergedAfterOcr = mergePdfTextLayers([embeddedText, ocrText]);
  const stillWeak = pdfTextIsWeakForBracketIngest(mergedAfterOcr);

  if (shouldVision && (mode === "vision" || stillWeak)) {
    try {
      visionText = await visionReadPdfBuffer(buffer);
      if (visionText.trim()) {
        warnings.push("Applied vision-model read of the bracket PDF image.");
      } else {
        warnings.push("Vision API returned no readable text.");
      }
    } catch (e) {
      warnings.push(`Vision read failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const text = mergePdfTextLayers([embeddedText, ocrText, visionText]);
  let source: PdfTextExtractionSource = embeddedSource;
  if (visionText?.trim() && (mode === "vision" || !embeddedText.trim())) {
    source = ocrText?.trim() ? "merged" : "vision";
  } else if (ocrText?.trim() && weakEmbedded) {
    source = embeddedText.trim() ? "merged" : "ocr";
  }

  if (mode === "off" && weakEmbedded && !text.trim()) {
    warnings.push(
      "Visual reader is off (BRACKET_PDF_VISUAL_READER=off). Scanned PDFs may not parse — set auto, ocr, or vision.",
    );
  }

  return {
    text,
    source,
    embeddedText,
    ocrText,
    visionText,
    warnings,
  };
}
