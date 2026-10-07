import { SCOUT_SYNC_PAGE_SIZE } from "@/lib/scout/config";
import { parseGmailMetadata, type ParsedScoutMessage } from "@/lib/scout/parseGmail";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const METADATA_HEADERS = [
  "From",
  "Subject",
  "Date",
  "Sender",
  "List-Unsubscribe",
  "List-Id",
  "Auto-Submitted",
  "Precedence",
  "Content-Type",
  "Content-Class",
] as const;

const HISTORY_PAGE_SIZE = 25;
const RATE_LIMIT_ATTEMPTS = 4;

export class ScoutGmailAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoutGmailAccessError";
  }
}

/** Gmail rejected a saved messages.list page token. The caller restarts that import. */
export class ScoutListCursorError extends Error {
  constructor() {
    super("Gmail list cursor was rejected");
    this.name = "ScoutListCursorError";
  }
}

export type GmailListedMessage = {
  id: string;
  threadId: string;
};

export type GmailHistoryResult =
  | { ok: true; messages: GmailListedMessage[]; historyId: string; nextPageToken?: string | null }
  | { ok: false; expired: true }
  | { ok: false; expired: false; message: string };

export type GmailGateway = {
  listInboxPage(input: {
    query: string;
    pageToken: string | null;
  }): Promise<{ messages: GmailListedMessage[]; nextPageToken: string | null }>;
  listHistory(startHistoryId: string, pageToken?: string | null): Promise<GmailHistoryResult>;
  getMetadata(id: string): Promise<ParsedScoutMessage | null>;
  currentHistoryId(): Promise<string>;
};

type FetchLike = typeof fetch;

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryWaitMs(res: Response, attempt: number, base: number): number {
  const header = res.headers.get("retry-after")?.trim() ?? "";
  if (/^\d+$/.test(header)) return Math.min(Number(header) * 1000, 5_000);
  return Math.min(base * 2 ** attempt, 5_000);
}

async function googleErrorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string; status?: string; errors?: { reason?: string }[] };
    };
    const reason = body.error?.errors?.[0]?.reason ?? "";
    const status = body.error?.status ?? "";
    const message = body.error?.message ?? "";
    return `${reason} ${status} ${message}`;
  } catch {
    return "";
  }
}

function isRateLimit(text: string): boolean {
  return /rateLimitExceeded|userRateLimitExceeded|quotaExceeded|dailyLimitExceeded|RATE_LIMIT|RESOURCE_EXHAUSTED/i.test(
    text,
  );
}

export function createGmailGateway(options: {
  token: string;
  fetchImpl?: FetchLike;
  accessErrorMessage: string;
  retryBaseMs?: number;
}): GmailGateway {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retryBaseMs = options.retryBaseMs ?? 400;

  async function gmailGet(path: string, query: URLSearchParams): Promise<Response> {
    const qs = query.toString();
    const url = qs ? `${GMAIL_BASE}${path}?${qs}` : `${GMAIL_BASE}${path}`;
    for (let attempt = 0; attempt < RATE_LIMIT_ATTEMPTS; attempt += 1) {
      const res = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${options.token}` },
        cache: "no-store",
      });
      if (res.status === 401) throw new ScoutGmailAccessError(options.accessErrorMessage);
      const rateLimited = res.status === 429 || (res.status === 403 && isRateLimit(await googleErrorText(res)));
      if (rateLimited) {
        if (attempt < RATE_LIMIT_ATTEMPTS - 1) {
          await wait(retryWaitMs(res, attempt, retryBaseMs));
          continue;
        }
        throw new Error("Gmail rate limit reached");
      }
      if (res.status === 403) throw new ScoutGmailAccessError(options.accessErrorMessage);
      return res;
    }
    throw new Error("Gmail rate limit reached");
  }

  return {
    async listInboxPage(input) {
      const query = new URLSearchParams();
      query.set("q", input.query);
      query.set("maxResults", String(SCOUT_SYNC_PAGE_SIZE));
      if (input.pageToken) query.set("pageToken", input.pageToken);
      const res = await gmailGet("/messages", query);
      if (res.status === 404) return { messages: [], nextPageToken: null };
      if (res.status === 400 && input.pageToken) throw new ScoutListCursorError();
      if (!res.ok) throw new Error(`Gmail request failed (${res.status})`);
      const body = (await res.json()) as {
        messages?: { id?: string; threadId?: string }[];
        nextPageToken?: string;
      };
      const messages: GmailListedMessage[] = [];
      for (const message of body.messages ?? []) {
        if (!message.id) continue;
        messages.push({ id: message.id, threadId: message.threadId || message.id });
      }
      return { messages, nextPageToken: body.nextPageToken ?? null };
    },

    async listHistory(startHistoryId, pageToken = null) {
      const query = new URLSearchParams();
      query.set("startHistoryId", startHistoryId);
      query.append("historyTypes", "messageAdded");
      query.set("labelId", "INBOX");
      query.set("maxResults", String(HISTORY_PAGE_SIZE));
      if (pageToken) query.set("pageToken", pageToken);
      const res = await gmailGet("/history", query);
      // 404 means the history id is too old. 400 is an invalid id or page token.
      // Both recover by listing the inbox again instead of retrying the same cursor.
      if (res.status === 404 || res.status === 400) return { ok: false, expired: true };
      if (!res.ok) return { ok: false, expired: false, message: `Gmail request failed (${res.status})` };
      const body = (await res.json()) as {
        history?: { messagesAdded?: { message?: { id?: string; threadId?: string } }[] }[];
        historyId?: string;
        nextPageToken?: string;
      };
      const messages: GmailListedMessage[] = [];
      const seen = new Set<string>();
      for (const item of body.history ?? []) {
        for (const added of item.messagesAdded ?? []) {
          const id = added.message?.id;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          messages.push({ id, threadId: added.message?.threadId || id });
        }
      }
      return {
        ok: true,
        messages,
        historyId: body.historyId || startHistoryId,
        nextPageToken: body.nextPageToken ?? null,
      };
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
