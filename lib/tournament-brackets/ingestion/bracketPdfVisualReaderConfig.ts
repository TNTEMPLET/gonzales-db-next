/**
 * When embedded PDF text is too thin for template/routing parse, try OCR or vision.
 *
 * Env (all optional):
 * - BRACKET_PDF_VISUAL_READER=off|auto|ocr|vision  (default auto)
 * - BRACKET_PDF_OCR_ENABLED=1  (default 1 in auto when text is weak)
 * - BRACKET_PDF_VISION_API_KEY — OpenAI-compatible key for vision fallback
 * - BRACKET_PDF_VISION_API_URL — default https://api.openai.com/v1/chat/completions
 * - BRACKET_PDF_VISION_MODEL — default gpt-4o-mini
 */
export type BracketPdfVisualReaderMode = "off" | "auto" | "ocr" | "vision";

export function resolveBracketPdfVisualReaderMode(): BracketPdfVisualReaderMode {
  const raw = (process.env.BRACKET_PDF_VISUAL_READER ?? "auto").trim().toLowerCase();
  if (raw === "off" || raw === "auto" || raw === "ocr" || raw === "vision") return raw;
  return "auto";
}

export function bracketPdfOcrEnabled(): boolean {
  const raw = (process.env.BRACKET_PDF_OCR_ENABLED ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export function bracketPdfVisionApiKey(): string | undefined {
  const key = process.env.BRACKET_PDF_VISION_API_KEY?.trim();
  return key || undefined;
}

/** True when DocHub-style tokens or LL routing labels are missing from embedded text. */
export function pdfTextIsWeakForBracketIngest(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/\b\d{1,2}T-G\d+/i.test(t)) return false;
  if (/Team\s+Little\s+League\s+Bracket/i.test(t)) return false;
  const winners = /Winner of Game #\d+/i.test(t);
  const losers = /Loser (?:From|of) Game #\d+/i.test(t);
  if (winners && losers) return false;
  if (t.length < 80) return true;
  return true;
}

export function mergePdfTextLayers(parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const part of parts) {
    if (!part?.trim()) continue;
    for (const line of part.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      lines.push(trimmed);
    }
  }
  return lines.join("\n");
}
