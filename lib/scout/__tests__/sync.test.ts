import assert from "node:assert/strict";
import { describe, it } from "node:test";

// This file must not call the model, even when a developer has a key set.
delete process.env.SCOUT_AI_API_KEY;

import {
  SCOUT_HISTORY_CURSOR_PREFIX,
  SCOUT_LIST_CURSOR_PREFIX,
  SCOUT_MAILBOX,
  SCOUT_SYNC_LEASE_MS,
  scoutInboxLookbackQuery,
} from "@/lib/scout/config";
import { ScoutGmailAccessError, createGmailGateway, type GmailGateway } from "@/lib/scout/gmailGateway";
import type { ParsedScoutMessage } from "@/lib/scout/parseGmail";
import type { ScoutStore, ScoutSyncStateRow } from "@/lib/scout/store";
import { createScoutClassifyRuntime } from "@/lib/scout/classify";
import { SCOUT_STORAGE_NOT_READY } from "@/lib/scout/storageError";
import { SCOUT_ALREADY_RUNNING, executeScoutSync, publicSyncError } from "@/lib/scout/sync";
import type { TicketSnapshot } from "@/lib/scout/plan";

function parsed(
  id: string,
  threadId = "synthetic-thread-1",
  overrides: Partial<ParsedScoutMessage> = {},
): ParsedScoutMessage {
  return {
    gmailMessageId: id,
    gmailThreadId: threadId,
    fromEmail: "synthetic.sender.alpha@apbaseball.com",
    fromName: "Synthetic Sender Alpha",
    subject: "Please update the synthetic roster",
    receivedAt: new Date("2026-10-01T15:00:00.000Z"),
    snippet: "Can you update the synthetic field list",
    labelIds: ["INBOX"],
    headers: [],
    ...overrides,
  };
}

function memoryStore(initial?: Partial<ScoutSyncStateRow>): ScoutStore & { state: ScoutSyncStateRow | null } {
  const messages = new Set<string>();
  const tickets = new Map<string, TicketSnapshot>();
  let lease: { token: string; until: number } | null = null;
  let leaseSeq = 0;
  const holder: { state: ScoutSyncStateRow | null } = {
    state: initial
      ? {
          lastHistoryId: initial.lastHistoryId ?? null,
          cursor: initial.cursor ?? null,
          lastRunAt: initial.lastRunAt ?? null,
          lastSuccessAt: initial.lastSuccessAt ?? null,
          lastError: initial.lastError ?? null,
        }
      : null,
  };
  return {
    get state() {
      return holder.state;
    },
    async hasMessage(id) {
      return messages.has(id);
    },
    async findTicket(_mailbox, threadId) {
      return tickets.get(threadId) ?? null;
    },
    async insertTicket(input) {
      if (messages.has(input.message.gmailMessageId)) return "duplicate";
      messages.add(input.message.gmailMessageId);
      tickets.set(input.gmailThreadId, {
        id: input.gmailThreadId,
        status: "NEW",
        subject: input.subject,
        senderEmail: input.senderEmail,
        senderName: input.senderName,
        firstMessageAt: input.firstMessageAt,
        lastMessageAt: input.lastMessageAt,
        snippet: input.snippet,
      });
      return "created";
    },
    async appendTicket(input) {
      if (messages.has(input.message.gmailMessageId)) return "duplicate";
      messages.add(input.message.gmailMessageId);
      const current = [...tickets.values()].find((ticket) => ticket.id === input.ticketId);
      if (!current) return "duplicate";
      const key = [...tickets.entries()].find(([, ticket]) => ticket.id === input.ticketId)?.[0];
      if (!key) return "duplicate";
      tickets.set(key, {
        ...current,
        status: input.status,
        snippet: input.snippet,
        lastMessageAt: input.lastMessageAt,
        firstMessageAt: input.firstMessageAt,
        subject: input.subject,
        senderEmail: input.senderEmail,
        senderName: input.senderName,
      });
      return "appended";
    },
    async getSyncState() {
      return holder.state;
    },
    async saveSyncState(_mailbox, patch) {
      const previous = holder.state;
      holder.state = {
        lastHistoryId:
          patch.lastHistoryId !== undefined ? patch.lastHistoryId : (previous?.lastHistoryId ?? null),
        cursor: patch.cursor !== undefined ? patch.cursor : (previous?.cursor ?? null),
        lastRunAt: patch.lastRunAt,
        lastSuccessAt:
          patch.lastSuccessAt !== undefined ? patch.lastSuccessAt : (previous?.lastSuccessAt ?? null),
        lastError: patch.lastError !== undefined ? patch.lastError : (previous?.lastError ?? null),
      };
    },
    async tryAcquireLease(_mailbox, now) {
      if (lease && lease.until > now.getTime()) return null;
      leaseSeq += 1;
      const token = `lease-${leaseSeq}`;
      lease = { token, until: now.getTime() + SCOUT_SYNC_LEASE_MS };
      return { token };
    },
    async releaseLease(_mailbox, token) {
      if (lease?.token === token) lease = null;
    },
  };
}

describe("executeScoutSync", () => {
  it("looks back 14 days on the first run, then follows history", async () => {
    const listed: string[] = [];
    const store = memoryStore();
    const firstGateway: GmailGateway = {
      async listInboxPage(input) {
        listed.push(input.query);
        assert.equal(input.pageToken, null);
        return { messages: [{ id: "synthetic-msg-1", threadId: "synthetic-thread-1" }], nextPageToken: null };
      },
      async listHistory() {
        throw new Error("history should not run on the first pass");
      },
      async getMetadata(id) {
        return parsed(id);
      },
      async currentHistoryId() {
        return "history-1";
      },
    };

    const now = new Date("2026-10-07T16:00:00.000Z");
    const first = await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now,
      gateway: firstGateway,
      store,
    });
    assert.equal(first.ok, true);
    assert.equal(first.created, 1);
    assert.deepEqual(listed, [scoutInboxLookbackQuery(14)]);
    assert.equal(store.state?.lastHistoryId, "history-1");
    assert.equal(store.state?.cursor, null);
    assert.equal(store.state?.lastError, null);

    const secondGateway: GmailGateway = {
      async listInboxPage() {
        throw new Error("full list should not run once history exists");
      },
      async listHistory(start) {
        assert.equal(start, "history-1");
        return { ok: true, messages: [], historyId: "history-2" };
      },
      async getMetadata() {
        return null;
      },
      async currentHistoryId() {
        return "unused";
      },
    };
    const second = await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now,
      gateway: secondGateway,
      store,
    });
    assert.equal(second.ok, true);
    assert.equal(store.state?.lastHistoryId, "history-2");
  });

  it("resumes a backfill cursor and falls back when history expires", async () => {
    const store = memoryStore({
      cursor: `${SCOUT_LIST_CURSOR_PREFIX}page-2`,
      lastHistoryId: "snapshot-kept",
    });
    const gateway: GmailGateway = {
      async listInboxPage(input) {
        assert.equal(input.pageToken, "page-2");
        return { messages: [], nextPageToken: "page-3" };
      },
      async listHistory() {
        throw new Error("history should wait until the list cursor is done");
      },
      async getMetadata() {
        return null;
      },
      async currentHistoryId() {
        throw new Error("snapshot already stored");
      },
    };
    const resumed = await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now: new Date("2026-10-07T16:00:00.000Z"),
      gateway,
      store,
    });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.backfillPending, true);
    assert.equal(store.state?.cursor, `${SCOUT_LIST_CURSOR_PREFIX}page-3`);
    assert.equal(store.state?.lastHistoryId, "snapshot-kept");

    const expiredStore = memoryStore({ lastHistoryId: "stale" });
    let listed = false;
    const expiredGateway: GmailGateway = {
      async listInboxPage() {
        listed = true;
        return { messages: [], nextPageToken: null };
      },
      async listHistory() {
        return { ok: false, expired: true };
      },
      async getMetadata() {
        return null;
      },
      async currentHistoryId() {
        return "fresh-history";
      },
    };
    const expired = await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now: new Date("2026-10-07T16:05:00.000Z"),
      gateway: expiredGateway,
      store: expiredStore,
    });
    assert.equal(expired.ok, true);
    assert.equal(listed, true);
    assert.equal(expiredStore.state?.lastHistoryId, "fresh-history");
    assert.equal(expiredStore.state?.cursor, null);
  });

  it("records an access failure without throwing", async () => {
    const store = memoryStore({ lastHistoryId: "history-1" });
    const gateway: GmailGateway = {
      async listInboxPage() {
        return { messages: [], nextPageToken: null };
      },
      async listHistory() {
        throw new ScoutGmailAccessError("Gmail access not granted yet");
      },
      async getMetadata() {
        return null;
      },
      async currentHistoryId() {
        return "x";
      },
    };
    const report = await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now: new Date("2026-10-07T16:00:00.000Z"),
      gateway,
      store,
    });
    assert.equal(report.ok, false);
    assert.equal(report.error, "Gmail access not granted yet");
    assert.equal(store.state?.lastError, "Gmail access not granted yet");
    assert.equal(store.state?.lastHistoryId, "history-1");
  });

  it("keeps the history id taken before a multi-page inbox import", async () => {
    let profileCalls = 0;
    const store = memoryStore();
    const gateway: GmailGateway = {
      async listInboxPage(input) {
        if (!input.pageToken) return { messages: [], nextPageToken: "page-2" };
        assert.equal(input.pageToken, "page-2");
        return { messages: [], nextPageToken: null };
      },
      async listHistory() {
        throw new Error("history waits until the import finishes");
      },
      async getMetadata() {
        return null;
      },
      async currentHistoryId() {
        profileCalls += 1;
        return profileCalls === 1 ? "snapshot" : "later-id";
      },
    };
    const now = new Date("2026-10-07T16:00:00.000Z");
    const first = await executeScoutSync({ mailbox: SCOUT_MAILBOX, now, gateway, store });
    assert.equal(first.backfillPending, true);
    assert.equal(store.state?.lastHistoryId, "snapshot");
    assert.equal(store.state?.cursor, `${SCOUT_LIST_CURSOR_PREFIX}page-2`);

    const second = await executeScoutSync({ mailbox: SCOUT_MAILBOX, now, gateway, store });
    assert.equal(second.ok, true);
    assert.equal(second.backfillPending, false);
    assert.equal(store.state?.lastHistoryId, "snapshot");
    assert.equal(store.state?.cursor, null);
    assert.equal(profileCalls, 1);
  });

  it("restarts an inbox cursor that has no history snapshot", async () => {
    const store = memoryStore({ cursor: `${SCOUT_LIST_CURSOR_PREFIX}page-9` });
    const gateway: GmailGateway = {
      async listInboxPage(input) {
        assert.equal(input.pageToken, null);
        return { messages: [], nextPageToken: null };
      },
      async listHistory() {
        throw new Error("history should not run");
      },
      async getMetadata() {
        return null;
      },
      async currentHistoryId() {
        return "fresh-snapshot";
      },
    };
    const report = await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now: new Date("2026-10-07T16:00:00.000Z"),
      gateway,
      store,
    });
    assert.equal(report.ok, true);
    assert.equal(store.state?.lastHistoryId, "fresh-snapshot");
    assert.equal(store.state?.cursor, null);
  });

  it("restarts when Gmail rejects a saved inbox page token", async () => {
    const store = memoryStore({
      cursor: `${SCOUT_LIST_CURSOR_PREFIX}stale-token`,
      lastHistoryId: "snapshot-1",
    });
    const tokens: (string | null)[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/messages")) {
        const token = url.searchParams.get("pageToken");
        tokens.push(token);
        if (token) return new Response("bad token", { status: 400 });
        return Response.json({ messages: [] });
      }
      return new Response("no", { status: 404 });
    };
    const gateway = createGmailGateway({
      token: "synthetic-token",
      fetchImpl,
      accessErrorMessage: "Gmail access not granted yet",
    });
    const report = await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now: new Date("2026-10-07T16:00:00.000Z"),
      gateway,
      store,
    });
    assert.equal(report.ok, true);
    assert.deepEqual(tokens, ["stale-token", null]);
    assert.equal(store.state?.lastHistoryId, "snapshot-1");
    assert.equal(store.state?.cursor, null);
  });

  it("follows one history page at a time", async () => {
    const store = memoryStore({ lastHistoryId: "history-1" });
    let historyCalls = 0;
    const gateway: GmailGateway = {
      async listInboxPage() {
        throw new Error("inbox list should wait for history");
      },
      async listHistory(start, pageToken) {
        historyCalls += 1;
        assert.equal(start, "history-1");
        if (historyCalls === 1) {
          assert.equal(pageToken ?? null, null);
          return { ok: true, messages: [], historyId: "too-new-to-store", nextPageToken: "h2" };
        }
        assert.equal(pageToken, "h2");
        return { ok: true, messages: [], historyId: "history-9", nextPageToken: null };
      },
      async getMetadata() {
        return null;
      },
      async currentHistoryId() {
        return "unused";
      },
    };
    const now = new Date("2026-10-07T16:00:00.000Z");
    const first = await executeScoutSync({ mailbox: SCOUT_MAILBOX, now, gateway, store });
    assert.equal(first.backfillPending, true);
    assert.equal(store.state?.cursor, `${SCOUT_HISTORY_CURSOR_PREFIX}h2`);
    assert.equal(store.state?.lastHistoryId, "history-1");

    const second = await executeScoutSync({ mailbox: SCOUT_MAILBOX, now, gateway, store });
    assert.equal(second.ok, true);
    assert.equal(store.state?.cursor, null);
    assert.equal(store.state?.lastHistoryId, "history-9");
  });

  it("does not list while another sync holds the lease", async () => {
    const store = memoryStore();
    const now = new Date("2026-10-07T16:00:00.000Z");
    const held = await store.tryAcquireLease(SCOUT_MAILBOX, now);
    assert.ok(held);
    let listed = false;
    const gateway: GmailGateway = {
      async listInboxPage() {
        listed = true;
        return { messages: [], nextPageToken: null };
      },
      async listHistory() {
        return { ok: false, expired: true };
      },
      async getMetadata() {
        return null;
      },
      async currentHistoryId() {
        return "history-1";
      },
    };
    const report = await executeScoutSync({ mailbox: SCOUT_MAILBOX, now, gateway, store });
    assert.equal(report.ok, false);
    assert.equal(report.error, SCOUT_ALREADY_RUNNING);
    assert.equal(listed, false);
    assert.equal(store.state, null);
    await store.releaseLease(SCOUT_MAILBOX, held.token);
  });

  it("counts calendar, list mail, and non-requests without creating tickets for them", async () => {
    const store = memoryStore();
    const gateway: GmailGateway = {
      async listInboxPage() {
        return {
          messages: [
            { id: "synthetic-msg-keep", threadId: "synthetic-thread-keep" },
            { id: "synthetic-msg-invite", threadId: "synthetic-thread-invite" },
            { id: "synthetic-msg-fyi", threadId: "synthetic-thread-fyi" },
            { id: "synthetic-msg-list", threadId: "synthetic-thread-list" },
            { id: "synthetic-msg-missing", threadId: "synthetic-thread-missing" },
          ],
          nextPageToken: null,
        };
      },
      async listHistory() {
        throw new Error("history should not run on the first pass");
      },
      async getMetadata(id) {
        if (id === "synthetic-msg-missing") return null;
        if (id === "synthetic-msg-invite") {
          return parsed(id, "synthetic-thread-invite", {
            subject: "Re: Updated invitation: Synthetic meetup",
            snippet: "Please update the synthetic roster",
          });
        }
        if (id === "synthetic-msg-fyi") {
          return parsed(id, "synthetic-thread-fyi", {
            subject: "FYI synthetic notes",
            snippet: "The snack schedule is posted.",
          });
        }
        if (id === "synthetic-msg-list") {
          return parsed(id, "synthetic-thread-list", {
            subject: "Please update the synthetic roster",
            headers: [{ name: "List-Unsubscribe", value: "<mailto:synthetic-unsubscribe@example.com>" }],
          });
        }
        return parsed(id, "synthetic-thread-keep");
      },
      async currentHistoryId() {
        return "history-1";
      },
    };
    const report = await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now: new Date("2026-10-07T16:00:00.000Z"),
      gateway,
      store,
      classify: createScoutClassifyRuntime({ ai: null, cache: new Map() }),
    });
    assert.equal(report.ok, true);
    assert.equal(report.created, 1);
    assert.equal(report.fallbackKeeps, 1);
    assert.equal(report.skipped, 4);
    assert.equal(report.skipCounts.calendar, 1);
    assert.equal(report.skipCounts["list mail"], 1);
    assert.equal(report.skipCounts.ai_unavailable_fallback, 1);
    assert.equal(report.skipCounts["missing metadata"], 1);
  });
});

describe("createGmailGateway", () => {
  it("requests metadata for the delegated user and treats 401 as access failure", async () => {
    const calls: { url: string; authorization: string | null }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, authorization: headers.get("authorization") });
      if (url.includes("/history")) return new Response("missing", { status: 404 });
      if (url.includes("/profile")) return Response.json({ historyId: "55" });
      if (url.includes("/messages/synthetic-msg-1")) {
        return Response.json({
          id: "synthetic-msg-1",
          threadId: "synthetic-thread-1",
          snippet: "Synthetic snippet",
          internalDate: "1760000000000",
          payload: {
            headers: [
              { name: "From", value: "Synthetic Sender Alpha <synthetic.sender.alpha@apbaseball.com>" },
              { name: "Subject", value: "Synthetic request" },
            ],
            body: { data: "full-body-should-not-be-kept" },
          },
        });
      }
      return Response.json({
        messages: [{ id: "synthetic-msg-1", threadId: "synthetic-thread-1" }],
        nextPageToken: "page-2",
      });
    };

    const gateway = createGmailGateway({
      token: "synthetic-token",
      fetchImpl,
      accessErrorMessage: "Gmail access not granted yet",
    });
    const page = await gateway.listInboxPage({ query: scoutInboxLookbackQuery(14), pageToken: null });
    assert.equal(page.nextPageToken, "page-2");
    const metadata = await gateway.getMetadata("synthetic-msg-1");
    assert.equal(metadata?.snippet, "Synthetic snippet");
    assert.equal(JSON.stringify(metadata).includes("full-body-should-not-be-kept"), false);
    const history = await gateway.listHistory("old");
    assert.deepEqual(history, { ok: false, expired: true });

    const invalidHistory: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/history")) return new Response(JSON.stringify({ error: { message: "Invalid historyId" } }), { status: 400 });
      return new Response("no", { status: 404 });
    };
    const invalidGateway = createGmailGateway({
      token: "synthetic-token",
      fetchImpl: invalidHistory,
      accessErrorMessage: "Gmail access not granted yet",
    });
    assert.deepEqual(await invalidGateway.listHistory("not-a-history-id"), { ok: false, expired: true });

    let rateCalls = 0;
    const rateLimited: typeof fetch = async () => {
      rateCalls += 1;
      if (rateCalls === 1) {
        return new Response(JSON.stringify({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }), {
          status: 403,
          headers: { "Retry-After": "0" },
        });
      }
      return Response.json({ historyId: "9" });
    };
    const rateGateway = createGmailGateway({
      token: "synthetic-token",
      fetchImpl: rateLimited,
      accessErrorMessage: "Gmail access not granted yet",
      retryBaseMs: 0,
    });
    assert.equal(await rateGateway.currentHistoryId(), "9");
    assert.equal(rateCalls, 2);

    const forbidden: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { errors: [{ reason: "insufficientPermissions" }] } }), { status: 403 });
    const forbiddenGateway = createGmailGateway({
      token: "synthetic-token",
      fetchImpl: forbidden,
      accessErrorMessage: "Gmail access not granted yet",
      retryBaseMs: 0,
    });
    await assert.rejects(
      () => forbiddenGateway.currentHistoryId(),
      (err: unknown) => err instanceof ScoutGmailAccessError,
    );

    const listCall = calls.find((call) => call.url.includes("/messages?") && !call.url.includes("/messages/"));
    assert.ok(listCall);
    const listUrl = new URL(listCall.url);
    assert.equal(listUrl.pathname, "/gmail/v1/users/me/messages");
    assert.equal(listUrl.searchParams.get("q"), "in:inbox newer_than:14d");
    assert.equal(listCall.authorization, "Bearer synthetic-token");

    const metadataCall = calls.find((call) => call.url.includes("/messages/synthetic-msg-1"));
    assert.ok(metadataCall);
    assert.match(metadataCall.url, /format=metadata/);
    assert.equal(metadataCall.url.includes("format=full"), false);
    assert.match(metadataCall.url, /metadataHeaders=Content-Type/);
    assert.match(metadataCall.url, /metadataHeaders=Content-Class/);

    const denied: typeof fetch = async () => new Response("no", { status: 401 });
    const deniedGateway = createGmailGateway({
      token: "synthetic-token",
      fetchImpl: denied,
      accessErrorMessage: "Gmail access not granted yet",
    });
    await assert.rejects(
      () => deniedGateway.currentHistoryId(),
      (err: unknown) => err instanceof ScoutGmailAccessError && err.message === "Gmail access not granted yet",
    );
  });
});

function idleGateway(): GmailGateway {
  return {
    async listInboxPage() {
      return { messages: [], nextPageToken: null };
    },
    async listHistory() {
      return { ok: false, expired: true };
    },
    async getMetadata() {
      return null;
    },
    async currentHistoryId() {
      return "history-1";
    },
  };
}

describe("scout sync error text", () => {
  it("keeps Gmail failures and hides raw JavaScript errors", () => {
    assert.equal(publicSyncError(new Error("Gmail request failed (503)"), "Scout sync failed"), "Gmail request failed (503)");
    assert.equal(
      publicSyncError(new Error("failed for synthetic.sender.alpha@apbaseball.com"), "Scout sync failed"),
      "failed for [email]",
    );
    assert.equal(
      publicSyncError(new ScoutGmailAccessError("Gmail access not granted yet"), "Gmail access not granted yet"),
      "Gmail access not granted yet",
    );
    assert.equal(
      publicSyncError(new TypeError("Cannot read properties of undefined (reading 'upsert')"), "Scout sync failed"),
      SCOUT_STORAGE_NOT_READY,
    );
    const missingTable = Object.assign(
      new Error("The table `public.ScoutSyncState` does not exist in the current database."),
      { code: "P2021" },
    );
    assert.equal(publicSyncError(missingTable, "Scout sync failed"), SCOUT_STORAGE_NOT_READY);
    const raw = publicSyncError(new TypeError("Cannot read properties of undefined (reading 'slice')"), "Scout sync failed");
    assert.equal(raw, "Scout sync failed");
    assert.equal(raw.includes("Cannot read"), false);
    assert.equal(publicSyncError(new TypeError("Illegal invocation"), "Scout sync failed"), "Scout sync failed");
    assert.equal(publicSyncError(new ReferenceError("missingBinding is not defined"), "Scout sync failed"), "Scout sync failed");
  });

  it("does not return a raw delegate or missing-table error from a sync", async () => {
    const now = new Date("2026-10-07T16:00:00.000Z");
    const missingDelegate = memoryStore();
    missingDelegate.getSyncState = async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'upsert')");
    };
    missingDelegate.saveSyncState = async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'upsert')");
    };
    const delegateReport = await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now,
      gateway: idleGateway(),
      store: missingDelegate,
    });
    assert.equal(delegateReport.ok, false);
    assert.equal(delegateReport.error, SCOUT_STORAGE_NOT_READY);

    const missingTable = memoryStore();
    missingTable.getSyncState = async () => {
      throw Object.assign(new Error('relation "ScoutTicket" does not exist'), { code: "42P01" });
    };
    missingTable.saveSyncState = async () => {
      throw Object.assign(new Error('relation "ScoutSyncState" does not exist'), { code: "42P01" });
    };
    const tableReport = await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now,
      gateway: idleGateway(),
      store: missingTable,
    });
    assert.equal(tableReport.error, SCOUT_STORAGE_NOT_READY);
    assert.equal(tableReport.error?.includes("relation"), false);
  });
});
