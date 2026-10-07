import { SCOUT_SNIPPET_MAX, SCOUT_SUBJECT_MAX } from "@/lib/scout/config";

/**
 * Shown when a message has no Gmail snippet and no plain-text part.
 * Display only. It is not written back to the ticket.
 */
export const SCOUT_NO_PREVIEW_LABEL = "(no preview)";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * One pass over Gmail's HTML-escaped `snippet`. Replacements are not scanned
 * again, so `&amp;lt;` stays the characters `&lt;`.
 */
export function decodeGmailEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (entity, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return "";
      if (code >= 0xd800 && code <= 0xdfff) return "";
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return "";
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Plain preview stored on a ticket. Gmail's snippet field is already entity-encoded;
 * decode first, then apply the 200-character cap. Never a full message body.
 */
export function toScoutSnippet(value: string | null | undefined): string {
  return clip(collapse(decodeGmailEntities(value ?? "")), SCOUT_SNIPPET_MAX);
}

/**
 * Plain text for the tickets UI. New rows are already decoded. Rows saved before
 * that change still hold Gmail's entities, and a later sync skips those message
 * ids, so this decodes again on read. A second pass does not change `<` or `&`.
 */
export function scoutDisplaySnippet(value: string | null | undefined): string {
  return decodeGmailEntities(value ?? "");
}

export function toScoutSubject(value: string | null | undefined): string {
  const collapsed = collapse(value ?? "");
  if (!collapsed) return "(no subject)";
  return clip(collapsed, SCOUT_SUBJECT_MAX);
}
