/**
 * Parse shirt sizes from PayPal checkout notes for the shirt-orders desk.
 *
 * NCP buttons typically join memos as:
 *   "Player Name | YS, YM, AL"
 * or free-form size text only.
 */

const SIZE_TOKEN =
  /^(?:youth|adult|y|a)?[\s\-_]*(?:xxl|2xl|xl|xs|s|m|l|\d{1,2})$/i;

/** Normalize a raw size fragment into a short display label. */
export function normalizeSizeLabel(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return "";

  // "2x Medium" / "2 x M" → leave for expansion elsewhere
  const lower = t.toLowerCase();

  // Youth / Adult prefixes
  const youth = /^(?:youth|y)[\s\-_]*/i;
  const adult = /^(?:adult|a)[\s\-_]*/i;
  let prefix = "";
  let rest = t;
  if (youth.test(t) && !/^y(?:s|m|l|xl|xs)$/i.test(t.replace(/\s+/g, ""))) {
    prefix = "Y";
    rest = t.replace(youth, "");
  } else if (adult.test(t) && !/^a(?:s|m|l|xl|xs)$/i.test(t.replace(/\s+/g, ""))) {
    prefix = "A";
    rest = t.replace(adult, "");
  }

  const compact = rest.replace(/[\s\-_]/g, "").toUpperCase();
  const map: Record<string, string> = {
    XS: "XS",
    S: "S",
    M: "M",
    L: "L",
    XL: "XL",
    XXL: "XXL",
    "2XL": "XXL",
    YS: "YS",
    YM: "YM",
    YL: "YL",
    YXL: "YXL",
    YXS: "YXS",
    AS: "AS",
    AM: "AM",
    AL: "AL",
    AXL: "AXL",
    AXXL: "AXXL",
  };

  if (map[compact]) {
    // Already has youth/adult letter
    if (/^[YA]/.test(map[compact])) return map[compact];
    return prefix ? `${prefix}${map[compact]}` : map[compact];
  }

  // "Youth Medium" → YM
  const word = rest.toLowerCase();
  const wordMap: Record<string, string> = {
    "x-small": "XS",
    xsmall: "XS",
    small: "S",
    medium: "M",
    large: "L",
    "x-large": "XL",
    xlarge: "XL",
    "xx-large": "XXL",
    xxlarge: "XXL",
  };
  if (wordMap[word]) {
    return prefix ? `${prefix}${wordMap[word]}` : wordMap[word];
  }

  // Fallback: cleaned original (e.g. "10", "12", free text)
  return t;
}

/**
 * Expand a sizes string into one label per shirt unit.
 * Handles: "M, L, XL" | "M M L" | "2xM" | "2 M, 1 L" | "YS YM AL"
 */
export function expandSizeLabels(sizesText: string, quantity: number): string[] {
  const text = sizesText.trim();
  if (!text) return Array.from({ length: quantity }, () => "");

  const labels: string[] = [];

  // Split on comma / slash / semicolon / newline first
  const chunks = text
    .split(/[,/;\n]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    // "2x M" / "2 x Medium" / "2M"
    const mult = chunk.match(/^(\d+)\s*[x×]\s*(.+)$/i) || chunk.match(/^(\d+)\s+(.+)$/);
    if (mult) {
      const n = Math.min(50, parseInt(mult[1]!, 10) || 1);
      const label = normalizeSizeLabel(mult[2]!);
      if (label) {
        for (let i = 0; i < n; i++) labels.push(label);
        continue;
      }
    }

    // Space-separated tokens within a chunk: "YS YM AL" or "M L"
    const tokens = chunk.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every((tok) => looksLikeSizeToken(tok))) {
      for (const tok of tokens) labels.push(normalizeSizeLabel(tok));
      continue;
    }

    // Compact glued tokens rare; treat whole chunk as one size
    labels.push(normalizeSizeLabel(chunk));
  }

  // If we got fewer labels than quantity, pad; if more, keep all (qty may be wrong)
  while (labels.length < quantity) labels.push("");
  if (labels.length > quantity && quantity > 0) {
    // Prefer exact qty when over-parsed
    return labels.slice(0, quantity);
  }
  return labels;
}

function looksLikeSizeToken(tok: string): boolean {
  const n = normalizeSizeLabel(tok);
  if (!n) return false;
  // Short labels or known patterns
  if (/^[YA]?(?:XXL|2XL|XL|XS|[SML])$/i.test(n.replace(/\s+/g, ""))) return true;
  if (/^(?:Y|A)?(?:XXL|XL|XS|[SML])$/i.test(tok.replace(/[\s\-_]/g, ""))) return true;
  return SIZE_TOKEN.test(tok.replace(/[\s\-_]/g, ""));
}

/** Split NCP-style "player | sizes" note. */
export function splitShirtNote(note: string | null | undefined): {
  player: string;
  sizes: string;
  raw: string;
} {
  const raw = (note ?? "").trim();
  if (!raw) return { player: "", sizes: "", raw: "" };
  const parts = raw.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { player: parts[0] ?? "", sizes: parts.slice(1).join(" | "), raw };
  }
  // Entire note may be sizes only
  return { player: "", sizes: raw, raw };
}

/**
 * Labels for each item seq (1-based). Falls back to empty string when unknown.
 */
export function sizeLabelsForOrder(
  note: string | null | undefined,
  quantity: number,
): string[] {
  const { sizes, raw } = splitShirtNote(note);
  const source = sizes || raw;
  return expandSizeLabels(source, Math.max(1, quantity));
}

/** Display label for item at seq (1-based). */
export function sizeLabelForItem(
  note: string | null | undefined,
  seq: number,
  quantity: number,
): string {
  const labels = sizeLabelsForOrder(note, quantity);
  const label = labels[seq - 1]?.trim() ?? "";
  return label || `Shirt #${seq}`;
}
