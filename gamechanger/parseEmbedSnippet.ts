import type { BracketGameChanger } from "@/lib/gamechanger/types";

const WIDGET_ID_RE = /widgetId:\s*["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/i;
const MAX_VERTICAL_RE = /maxVerticalGamesVisible:\s*(\d+)/;
const LAYOUT_RE = /layout:\s*["'](vertical|horizontal)["']/;

export type ParseEmbedResult =
  | { ok: true; config: BracketGameChanger }
  | { ok: false; error: string };

export function parseGameChangerEmbedSnippet(snippet: string): ParseEmbedResult {
  const text = snippet.trim();
  if (!text) {
    return { ok: false, error: "Paste the GameChanger embed snippet first." };
  }

  const widgetMatch = text.match(WIDGET_ID_RE);
  if (!widgetMatch?.[1]) {
    return { ok: false, error: "Could not find widgetId in the snippet." };
  }

  const config: BracketGameChanger = { widgetId: widgetMatch[1] };

  const maxVert = text.match(MAX_VERTICAL_RE);
  if (maxVert?.[1]) {
    const n = Number.parseInt(maxVert[1], 10);
    if (n >= 1 && n <= 20) config.maxVerticalGamesVisible = n;
  }

  const layoutMatch = text.match(LAYOUT_RE);
  if (layoutMatch?.[1] === "vertical" || layoutMatch?.[1] === "horizontal") {
    config.layout = layoutMatch[1];
  }

  return { ok: true, config };
}
