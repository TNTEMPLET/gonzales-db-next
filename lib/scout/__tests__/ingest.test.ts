import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SCOUT_MAILBOX, SCOUT_SNIPPET_MAX } from "@/lib/scout/config";
import { ingestParsedMessage } from "@/lib/scout/ingest";
import { parseGmailMetadata, type ParsedScoutMessage } from "@/lib/scout/parseGmail";
import { planScoutMessage, scoutTicketAppendData, type TicketSnapshot } from "@/lib/scout/plan";
import type { ScoutIngestStore } from "@/lib/scout/store";

function message(overrides: Partial<ParsedScoutMessage> = {}): ParsedScoutMessage {
  return {
    gmailMessageId: "synthetic-msg-1",
    gmailThreadId: "synthetic-thread-1",
    fromEmail: "synthetic.sender.alpha@apbaseball.com",
    fromName: "Synthetic Sender Alpha",
    subject: "Synthetic request",
    receivedAt: new Date("2026-10-01T15:00:00.000Z"),
    snippet: "Synthetic snippet for the ticket list.",
    labelIds: ["INBOX"],
    headers: [{ name: "From", value: "Synthetic Sender Alpha <synthetic.sender.alpha@apbaseball.com>" }],
    ...overrides,
  };
}

function memoryStore(): ScoutIngestStore & { tickets: Map<string, TicketSnapshot & { threadId: string }> } {
  const messages = new Set<string>();
  const tickets = new Map<string, TicketSnapshot & { threadId: string }>();
  let seq = 0;
  return {
    tickets,
    async hasMessage(id) {
      return messages.has(id);
    },
    async findTicket(mailbox, threadId) {
      if (mailbox !== SCOUT_MAILBOX) return null;
      return tickets.get(threadId) ?? null;
    },
    async insertTicket(input) {
      if (messages.has(input.message.gmailMessageId) || tickets.has(input.gmailThreadId)) return "duplicate";
      messages.add(input.message.gmailMessageId);
      const id = `ticket-${++seq}`;
      tickets.set(input.gmailThreadId, {
        id,
        threadId: input.gmailThreadId,
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
      const current = [...tickets.values()].find((ticket) => ticket.id === input.ticketId);
      if (!current) return "duplicate";
      messages.add(input.message.gmailMessageId);
      tickets.set(current.threadId, {
        ...current,
        status: input.status,
        subject: input.subject,
        senderEmail: input.senderEmail,
        senderName: input.senderName,
        firstMessageAt: input.firstMessageAt,
        lastMessageAt: input.lastMessageAt,
        snippet: input.snippet,
      });
      return "appended";
    },
  };
}

describe("planScoutMessage", () => {
  it("creates one new ticket per thread and clips the snippet", () => {
    const plan = planScoutMessage(
      null,
      SCOUT_MAILBOX,
      message({ snippet: "x".repeat(SCOUT_SNIPPET_MAX + 40) }),
    );
    assert.equal(plan.type, "create");
    if (plan.type !== "create") return;
    assert.equal(plan.status, "NEW");
    assert.equal(plan.snippet.length <= SCOUT_SNIPPET_MAX, true);
    assert.equal(plan.message.snippet.length <= SCOUT_SNIPPET_MAX, true);
    assert.equal("body" in plan, false);
    assert.match(plan.gmailUrl, /synthetic-thread-1/);
  });

  it("appends to the same thread and reopens done or dismissed tickets", () => {
    const existing: TicketSnapshot = {
      id: "ticket-1",
      status: "DONE",
      subject: "Synthetic request",
      senderEmail: "synthetic.sender.alpha@apbaseball.com",
      senderName: "Synthetic Sender Alpha",
      firstMessageAt: new Date("2026-10-01T15:00:00.000Z"),
      lastMessageAt: new Date("2026-10-01T15:00:00.000Z"),
      snippet: "Older snippet",
    };
    const newer = planScoutMessage(
      existing,
      SCOUT_MAILBOX,
      message({
        gmailMessageId: "synthetic-msg-2",
        receivedAt: new Date("2026-10-02T15:00:00.000Z"),
        snippet: "Newer synthetic snippet",
      }),
    );
    assert.equal(newer.type, "append");
    if (newer.type !== "append") return;
    assert.equal(newer.reopened, true);
    assert.equal(newer.latestMessage, true);
    assert.equal(newer.status, "OPEN");
    assert.equal(newer.snippet, "Newer synthetic snippet");
    assert.equal("status" in scoutTicketAppendData(newer), false);

    const waiting = planScoutMessage(
      { ...existing, status: "WAITING" },
      SCOUT_MAILBOX,
      message({
        gmailMessageId: "synthetic-msg-3",
        receivedAt: new Date("2026-10-03T15:00:00.000Z"),
      }),
    );
    assert.equal(waiting.type, "append");
    if (waiting.type !== "append") return;
    assert.equal(waiting.status, "WAITING");
    assert.equal(waiting.reopened, false);

    const dismissed = planScoutMessage(
      { ...existing, status: "DISMISSED" },
      SCOUT_MAILBOX,
      message({
        gmailMessageId: "synthetic-msg-4",
        receivedAt: new Date("2026-10-04T15:00:00.000Z"),
      }),
    );
    assert.equal(dismissed.type, "append");
    if (dismissed.type !== "append") return;
    assert.equal(dismissed.status, "OPEN");
  });

  it("does not reopen when an older message arrives after the ticket was closed", () => {
    const plan = planScoutMessage(
      {
        id: "ticket-1",
        status: "DONE",
        subject: "Later subject",
        senderEmail: "synthetic.sender.beta@impact-sports.net",
        senderName: "Synthetic Sender Beta",
        firstMessageAt: new Date("2026-10-05T15:00:00.000Z"),
        lastMessageAt: new Date("2026-10-05T15:00:00.000Z"),
        snippet: "Latest",
      },
      SCOUT_MAILBOX,
      message({
        gmailMessageId: "synthetic-msg-old",
        subject: "Earlier subject",
        receivedAt: new Date("2026-10-01T15:00:00.000Z"),
        snippet: "Earlier snippet",
      }),
    );
    assert.equal(plan.type, "append");
    if (plan.type !== "append") return;
    assert.equal(plan.status, "DONE");
    assert.equal(plan.reopened, false);
    assert.equal(plan.latestMessage, false);
    assert.equal(plan.subject, "Earlier subject");
    assert.equal(plan.snippet, "Latest");
  });
});

describe("ingestParsedMessage", () => {
  it("is idempotent and skips mail that fails the sender rule", async () => {
    const store = memoryStore();
    const first = await ingestParsedMessage(store, SCOUT_MAILBOX, message());
    const second = await ingestParsedMessage(store, SCOUT_MAILBOX, message());
    assert.equal(first.type, "created");
    assert.equal(second.type, "duplicate");
    assert.equal(store.tickets.size, 1);

    const skipped = await ingestParsedMessage(
      store,
      SCOUT_MAILBOX,
      message({
        gmailMessageId: "synthetic-msg-skip",
        gmailThreadId: "synthetic-thread-skip",
        fromEmail: "noreply@apbaseball.com",
      }),
    );
    assert.equal(skipped.type, "skipped");
    assert.equal(store.tickets.size, 1);
  });

  it("appends a later message and reopens a done ticket", async () => {
    const store = memoryStore();
    await ingestParsedMessage(store, SCOUT_MAILBOX, message());
    const ticket = store.tickets.get("synthetic-thread-1");
    assert.ok(ticket);
    ticket.status = "DONE";

    const appended = await ingestParsedMessage(
      store,
      SCOUT_MAILBOX,
      message({
        gmailMessageId: "synthetic-msg-2",
        receivedAt: new Date("2026-10-03T15:00:00.000Z"),
        snippet: "Synthetic follow-up",
      }),
    );
    assert.deepEqual(appended, { type: "appended", reopened: true });
    assert.equal(store.tickets.get("synthetic-thread-1")?.status, "OPEN");
    assert.equal(store.tickets.get("synthetic-thread-1")?.snippet, "Synthetic follow-up");
  });
});

describe("parseGmailMetadata", () => {
  it("keeps headers and a snippet and drops the body", () => {
    const parsed = parseGmailMetadata({
      id: "synthetic-msg-1",
      threadId: "synthetic-thread-1",
      labelIds: ["INBOX"],
      snippet: "Synthetic snippet",
      internalDate: "1760000000000",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "Synthetic Sender Alpha <synthetic.sender.alpha@apbaseball.com>" },
          { name: "Subject", value: "Synthetic request" },
        ],
        body: { data: "full-body-should-not-be-kept", size: 32 },
        parts: [{ filename: "notes.pdf" }],
      },
    });
    assert.ok(parsed);
    assert.equal(parsed?.fromEmail, "synthetic.sender.alpha@apbaseball.com");
    assert.equal(parsed?.fromName, "Synthetic Sender Alpha");
    assert.equal(parsed?.snippet, "Synthetic snippet");
    assert.equal("body" in (parsed ?? {}), false);
    assert.equal(JSON.stringify(parsed).includes("full-body-should-not-be-kept"), false);
    assert.equal(JSON.stringify(parsed).includes("notes.pdf"), false);
  });

  it("uses a plain-text excerpt when the snippet is empty and ignores attachments", () => {
    const excerpt = "Synthetic chart was attached. This preview is the plain part.";
    const parsed = parseGmailMetadata({
      id: "synthetic-msg-chart",
      threadId: "synthetic-thread-chart",
      labelIds: ["INBOX"],
      snippet: "  ",
      internalDate: "1760000000000",
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: "Synthetic Sender Alpha <synthetic.sender.alpha@apbaseball.com>" },
          { name: "Subject", value: "Synthetic chart" },
        ],
        parts: [
          { mimeType: "text/plain", body: { data: Buffer.from(excerpt, "utf8").toString("base64url") } },
          {
            mimeType: "image/png",
            filename: "chart.png",
            body: { data: Buffer.from("not-the-preview", "utf8").toString("base64url") },
          },
        ],
      },
    });
    assert.equal(parsed?.snippet, excerpt);
    assert.equal(JSON.stringify(parsed).includes("chart.png"), false);
    assert.equal(JSON.stringify(parsed).includes("not-the-preview"), false);
  });

  it("leaves an attachment-only message without a snippet", () => {
    const parsed = parseGmailMetadata({
      id: "synthetic-msg-attachment",
      threadId: "synthetic-thread-attachment",
      labelIds: ["INBOX"],
      snippet: "",
      internalDate: "1760000000000",
      payload: {
        mimeType: "multipart/mixed",
        headers: [{ name: "From", value: "Synthetic Sender Alpha <synthetic.sender.alpha@apbaseball.com>" }],
        parts: [{ mimeType: "image/png", filename: "chart.png", body: { size: 1200 } }],
      },
    });
    assert.equal(parsed?.snippet, "");
    assert.equal(JSON.stringify(parsed).includes("chart.png"), false);
  });
});
