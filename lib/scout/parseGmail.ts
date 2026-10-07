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
  payload?: {
    mimeType?: string;
    headers?: { name?: string; value?: string }[];
    body?: { data?: string; size?: number };
    parts?: unknown[];
  };
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

/**
 * Reads Gmail metadata (headers + snippet). Drops body parts and attachments.
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

  return {
    gmailMessageId,
    gmailThreadId,
    fromEmail: from.email,
    fromName: from.name,
    subject: headerValue(headers, "Subject") ?? "",
    receivedAt,
    snippet: raw.snippet ?? "",
    labelIds: raw.labelIds ?? [],
    headers,
  };
}
