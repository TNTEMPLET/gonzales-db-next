import {
  bracketPdfVisionApiUrl,
  bracketPdfVisionApiKey,
} from "@/lib/tournament-brackets/ingestion/bracketPdfVisualReaderConfig";
import { renderPdfPagesToPng } from "@/lib/tournament-brackets/ingestion/renderPdfPagesToPng";

const VISION_PROMPT = `You are reading a youth baseball tournament bracket PDF page image.
Extract ALL readable text exactly as shown, preserving structure. Include:
- Game numbers (Game #1, G1, etc.)
- Team names in opener slots
- Feeder labels ("Winner of Game #N", "Loser of Game #N", "Loser From Game #N")
- Schedule lines (date, time, field) near each game
- Division, site, championship, and "if necessary" wording
- DocHub-style ids like 6T-G11-T2 if visible

Return plain text only — one logical label or value per line. No commentary.`;

/**
 * Vision-model read of bracket PDF pages (OpenAI-compatible chat completions API).
 * Requires BRACKET_PDF_VISION_API_KEY for OpenAI, or BRACKET_PDF_VISION_API_URL for a local
 * OpenAI-compatible OCR/vision service.
 */
export async function visionReadPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  const apiKey = bracketPdfVisionApiKey();
  const apiUrl = bracketPdfVisionApiUrl();
  if (!apiKey && !process.env.BRACKET_PDF_VISION_API_URL?.trim()) {
    throw new Error("BRACKET_PDF_VISION_API_KEY is not configured.");
  }

  const model = process.env.BRACKET_PDF_VISION_MODEL?.trim() || "gpt-4o-mini";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const cfAccessClientId = process.env.BRACKET_PDF_VISION_CF_ACCESS_CLIENT_ID?.trim();
  const cfAccessClientSecret = process.env.BRACKET_PDF_VISION_CF_ACCESS_CLIENT_SECRET?.trim();
  if (cfAccessClientId && cfAccessClientSecret) {
    headers["CF-Access-Client-Id"] = cfAccessClientId;
    headers["CF-Access-Client-Secret"] = cfAccessClientSecret;
  }

  const usePdfDirect =
    /\barchie-rapidocr\b/i.test(model) || /bracket-vision\.duckroostdigital\.com/i.test(apiUrl);
  let dataUrl: string;
  if (usePdfDirect) {
    dataUrl = `data:application/pdf;base64,${Buffer.from(buffer).toString("base64")}`;
  } else {
    const pages = await renderPdfPagesToPng(buffer, { maxPages: 1, scale: 2 });
    if (pages.length === 0) return "";
    dataUrl = `data:image/png;base64,${pages[0]!.toString("base64")}`;
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vision API failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join("\n")
      .trim();
  }
  return "";
}
