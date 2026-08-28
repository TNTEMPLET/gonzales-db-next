/**
 * Extract plain text from a PDF buffer (Node.js / server routes).
 * Uses pdf-parse when available; falls back to parenthesis-string scan for simple PDFs.
 */
export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Buffer.from(buffer) });
    try {
      const result = await parser.getText();
      const text = typeof result.text === "string" ? result.text.trim() : "";
      if (text.length > 0) return text;
    } finally {
      await parser.destroy();
    }
  } catch {
    // pdf-parse missing or failed — try heuristic extraction below
  }
  return extractPdfTextHeuristic(buffer);
}

/** Best-effort scan of PDF literal strings `( … )` used by many bracket PDF exports. */
export function extractPdfTextHeuristic(buffer: ArrayBuffer): string {
  const raw = new TextDecoder("latin1").decode(new Uint8Array(buffer));
  const chunks: string[] = [];
  const re = /\((?:\\.|[^\\)])*\)/g;
  for (const match of raw.matchAll(re)) {
    const inner = match[0].slice(1, -1);
    const decoded = decodePdfLiteralString(inner).trim();
    if (!decoded || decoded.length > 200) continue;
    if (/^[\x00-\x08\x0e-\x1f]+$/.test(decoded)) continue;
    chunks.push(decoded);
  }
  return chunks.join("\n");
}

function decodePdfLiteralString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}
