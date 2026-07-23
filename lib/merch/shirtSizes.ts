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
 * Handles:
 *   "M, L, XL" | "M M L" | "2xM" | "2 M, 1 L" | "YS YM AL"
 *   "Adult XL\nAdult Small\nYouth Medium"  (real newlines)
 *   "Adult XL\\nAdult Small\\nYouth Medium" (literal \n from some PayPal exports)
 */
export function expandSizeLabels(sizesText: string, quantity: number): string[] {
  // Normalize escaped newlines / CRLF before splitting into shirt units.
  const text = sizesText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .trim();
  if (!text) return Array.from({ length: quantity }, () => "");

  const labels: string[] = [];

  // One shirt per line / comma / slash / semicolon.
  // Example: "Adult XL\nAdult Small\nYouth Medium" → AXL, AS, YM
  const chunks = text
    .split(/[,/;\n]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    // "2x M" / "2 x Medium" / "2M" / "1-AM" / "1-AL" (common NCP free-text)
    const mult =
      chunk.match(/^(\d+)\s*[x×]\s*(.+)$/i) ||
      chunk.match(/^(\d+)\s*-\s*([A-Za-z].+)$/) ||
      chunk.match(/^(\d+)\s+(.+)$/);
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

/** Draft order codes embedded in PayPal notes (e.g. MO-AB12CD). */
const DRAFT_CODE_RE = /^MO-[A-Z0-9]{4,10}$/i;

/** Split NCP-style "player | sizes" note (optional leading draft code). */
export function splitShirtNote(note: string | null | undefined): {
  player: string;
  sizes: string;
  raw: string;
  /** Present when note starts with or contains a merch draft code. */
  draftCode: string | null;
} {
  const raw = (note ?? "").trim();
  if (!raw) return { player: "", sizes: "", raw: "", draftCode: null };

  const parts = raw.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  let draftCode: string | null = null;
  let rest = parts;

  // "MO-XXXX | Player | YS, AL" or "MO-XXXX | Player Name only"
  if (rest[0] && DRAFT_CODE_RE.test(rest[0])) {
    draftCode = rest[0]!.toUpperCase();
    rest = rest.slice(1);
  } else {
    const embedded = raw.toUpperCase().match(/\bMO-[A-Z0-9]{4,10}\b/);
    if (embedded) draftCode = embedded[0];
  }

  if (rest.length >= 2) {
    return {
      player: rest[0] ?? "",
      sizes: rest.slice(1).join(" | "),
      raw,
      draftCode,
    };
  }
  if (rest.length === 1) {
    // Could be player-only or sizes-only; treat as player when draft code present
    if (draftCode) {
      return { player: rest[0] ?? "", sizes: "", raw, draftCode };
    }
    return { player: "", sizes: rest[0] ?? "", raw, draftCode };
  }
  return { player: "", sizes: "", raw, draftCode };
}

/**
 * Labels for each item seq (1-based). Falls back to empty string when unknown.
 */
export function sizeLabelsForOrder(
  note: string | null | undefined,
  quantity: number,
): string[] {
  const { sizes, raw, draftCode, player } = splitShirtNote(note);
  // Prefer the sizes segment. If missing, strip draft code / player from raw
  // so we don't treat "MO-XXXX | Jordan" as a size token.
  let source = sizes;
  if (!source) {
    let fallback = raw;
    if (draftCode) {
      fallback = fallback.replace(new RegExp(draftCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "");
    }
    if (player) {
      fallback = fallback.replace(player, "");
    }
    source = fallback.replace(/\|/g, " ").trim();
  }
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

export type ShirtSizeItemRef = {
  seq: number;
  sizeLabel?: string | null;
};

/**
 * Prefer stored per-item sizeLabel (admin-corrected); fall back to parsing the PayPal note.
 */
export function resolvedSizeLabelsForOrder(
  note: string | null | undefined,
  quantity: number,
  items?: ShirtSizeItemRef[] | null,
): string[] {
  const fromNote = sizeLabelsForOrder(note, quantity);
  const q = Math.max(1, quantity);
  const bySeq = new Map<number, string>();
  for (const item of items ?? []) {
    const label = (item.sizeLabel ?? "").trim();
    if (label) bySeq.set(item.seq, label);
  }
  return Array.from({ length: q }, (_, i) => {
    const seq = i + 1;
    return bySeq.get(seq) || fromNote[i]?.trim() || "";
  });
}

export function resolvedSizeLabelForItem(
  note: string | null | undefined,
  quantity: number,
  item: ShirtSizeItemRef,
  items?: ShirtSizeItemRef[] | null,
): string {
  const stored = (item.sizeLabel ?? "").trim();
  if (stored) return stored;
  const all = resolvedSizeLabelsForOrder(note, quantity, items);
  const label = all[item.seq - 1]?.trim() ?? "";
  return label || `Shirt #${item.seq}`;
}

/** Build create payload for ShirtOrderItem rows with parsed sizes from note/draft. */
export function shirtOrderItemCreatesFromNote(
  note: string | null | undefined,
  quantity: number,
): { seq: number; sizeLabel: string | null }[] {
  const labels = sizeLabelsForOrder(note, quantity);
  return Array.from({ length: Math.max(1, quantity) }, (_, i) => {
    const label = labels[i]?.trim() || null;
    return { seq: i + 1, sizeLabel: label };
  });
}
