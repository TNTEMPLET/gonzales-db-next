import { SCOUT_SYNC_PAGE_SIZE } from "@/lib/scout/config";
import { parseGmailMetadata, type ParsedScoutMessage } from "@/lib/scout/parseGmail";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const METADATA_HEADERS = [
  "From",
  "Subject",
  "Date",
  "List-Unsubscribe",
  "List-Id",
  "Auto-Submitted",
  "Precedence",
] as const;

export class ScoutGmailAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoutGmailAccessError";
  }
}

export type GmailListedMessage = {
  id: string;
  threadId: string;
};

export type GmailHistoryResult =
  | { ok: true; messages: GmailListedMessage[]; historyId: string }
  | { ok: false; expired: true }
  | { ok: false; expired: false; message: string };

export type GmailGateway = {
  listInboxPage(input: {
    query: string;
    pageToken: string | null;
  }): Promise<{ messages: GmailListedMessage[]; nextPageToken: string | null }>;
  listHistory(startHistoryId: string): Promise<GmailHistoryResult>;
  getMetadata(id: string): Promise<ParsedScoutMessage | null>;
  currentHistoryId(): Promise<string>;
};

type FetchLike = typeof fetch;

export function createGmailGateway(options: {
  token: string;
  fetchImpl?: FetchLike;
  accessErrorMessage: string;
}): GmailGateway {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function gmailGet(path: string, query: URLSearchParams): Promise<Response> {
    const qs = query.toString();
    const url = qs ? `${GMAIL_BASE}${path}?${qs}` : `${GMAIL_BASE}${path}`;
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${options.token}` },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      throw new ScoutGmailAccessError(options.accessErrorMessage);
    }
    return res;
  }

  return {
    async listInboxPage(input) {
      const query = new URLSearchParams();
      query.set("q", input.query);
      query.set("maxResults", String(SCOUT_SYNC_PAGE_SIZE));
      if (input.pageToken) query.set("pageToken", input.pageToken);
      const res = await gmailGet("/messages", query);
      if (res.status === 404) return { messages: [], nextPageToken: null };
      if (!res.ok) throw new Error(`Gmail request failed (${res.status})`);
      const body = (await res.json()) as {
        messages?: { id?: string; threadId?: string }[];
        nextPageToken?: string;
      };
      const messages: GmailListedMessage[] = [];
      for (const message of body.messages ?? []) {
        if (!message.id || !message.threadId) continue;
        messages.push({ id: message.id, threadId: message.threadId });
      }
      return { messages, nextPageToken: body.nextPageToken ?? null };
    },

    async listHistory(startHistoryId) {
      const messages: GmailListedMessage[] = [];
      const seen = new Set<string>();
      let pageToken: string | null = null;
      let historyId = startHistoryId;

      for (let page = 0; page < 20; page += 1) {
        const query = new URLSearchParams();
        query.set("startHistoryId", startHistoryId);
        query.append("historyTypes", "messageAdded");
        query.set("labelId", "INBOX");
        query.set("maxResults", "100");
        if (pageToken) query.set("pageToken", pageToken);
        const res = await gmailGet("/history", query);
        if (res.status === 404) return { ok: false, expired: true };
        if (!res.ok) return { ok: false, expired: false, message: `Gmail request failed (${res.status})` };
        const body = (await res.json()) as {
          history?: { messagesAdded?: { message?: { id?: string; threadId?: string } }[] }[];
          historyId?: string;
          nextPageToken?: string;
        };
        if (body.historyId) historyId = body.historyId;
        for (const item of body.history ?? []) {
          for (const added of item.messagesAdded ?? []) {
            const id = added.message?.id;
            const threadId = added.message?.threadId;
            if (!id || !threadId || seen.has(id)) continue;
            seen.add(id);
            messages.push({ id, threadId });
          }
        }
        if (!body.nextPageToken) {
          return { ok: true, messages, historyId };
        }
        pageToken = body.nextPageToken;
      }

      return { ok: false, expired: false, message: "Gmail history page limit reached" };
    },

    async getMetadata(id) {
      const query = new URLSearchParams();
      query.set("format", "metadata");
      for (const header of METADATA_HEADERS) query.append("metadataHeaders", header);
      const res = await gmailGet(`/messages/${encodeURIComponent(id)}`, query);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Gmail request failed (${res.status})`);
      const body = (await res.json()) as Parameters<typeof parseGmailMetadata>[0];
      return parseGmailMetadata(body);
    },

    async currentHistoryId() {
      const res = await gmailGet("/profile", new URLSearchParams());
      if (!res.ok) throw new Error(`Gmail request failed (${res.status})`);
      const body = (await res.json()) as { historyId?: string };
      if (!body.historyId) throw new Error("Gmail request failed (profile)");
      return body.historyId;
    },
  };
}
