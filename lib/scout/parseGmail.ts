import { headerValue, type ScoutHeader } from "@/lib/scout/senderRule";

export type ParsedScoutMessage = {
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  receivedAt: Date;
  snippet: string;
  labelIds: string[];
  headers: ScoutHeader[];
};

export type GmailMetadataResource = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailMetadataPart;
};

type GmailMetadataPart = {
  mimeType?: string;
  filename?: string;
  headers?: { name?: string; value?: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailMetadataPart[];
};

export function parseMailboxAddress(raw: string): { email: string; name: string | null } {
  const trimmed = raw.trim();
  const angle = trimmed.match(/<([^<>]+)>/);
  const emailSource = (angle ? angle[1] : trimmed).trim().replace(/^mailto:/i, "");
  const email = emailSource.toLowerCase();
  if (!angle || angle.index === undefined) return { email, name: null };
  const name = trimmed
    .slice(0, angle.index)
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1")
    .trim();
  return { email, name: name || null };
}

function parseReceivedAt(internalDate: string | undefined, dateHeader: string | null): Date | null {
  if (internalDate && /^\d+$/.test(internalDate)) {
    const ms = Number(internalDate);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  if (dateHeader) {
    const parsed = new Date(dateHeader);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

/** Short plain-text part, only when the metadata payload actually includes bytes. */
function plainTextExcerpt(part: GmailMetadataPart | undefined, depth: number): string {
  if (!part || depth > 8) return "";
  const filename = part.filename?.trim() ?? "";
  if (!filename && part.mimeType?.toLowerCase() === "text/plain" && part.body?.data) {
    const text = decodeBase64Url(part.body.data);
    if (text.trim()) return text.slice(0, 1000);
  }
  for (const child of part.parts ?? []) {
    const found = plainTextExcerpt(child, depth + 1);
    if (found.trim()) return found;
  }
  return "";
}

/**
 * Reads Gmail metadata (headers + snippet). A metadata fetch normally has no
 * body bytes. When the snippet is empty and a text/plain part is present, that
 * part is kept only as a short excerpt. Attachments are dropped.
 * Returns null when the message has no id, thread, or date.
 */
export function parseGmailMetadata(raw: GmailMetadataResource): ParsedScoutMessage | null {
  const gmailMessageId = raw.id?.trim() ?? "";
  const gmailThreadId = raw.threadId?.trim() ?? "";
  if (!gmailMessageId || !gmailThreadId) return null;

  const headers: ScoutHeader[] = [];
  for (const header of raw.payload?.headers ?? []) {
    if (typeof header.name !== "string" || typeof header.value !== "string") continue;
    headers.push({ name: header.name, value: header.value });
  }

  const from = parseMailboxAddress(headerValue(headers, "From") ?? "");
  const receivedAt = parseReceivedAt(raw.internalDate, headerValue(headers, "Date"));
  if (!receivedAt) return null;

  const gmailSnippet = raw.snippet ?? "";
  const snippet = gmailSnippet.trim() ? gmailSnippet : plainTextExcerpt(raw.payload, 0);

  return {
    gmailMessageId,
    gmailThreadId,
    fromEmail: from.email,
    fromName: from.name,
    subject: headerValue(headers, "Subject") ?? "",
    receivedAt,
    snippet,
    labelIds: raw.labelIds ?? [],
    headers,
  };
}
