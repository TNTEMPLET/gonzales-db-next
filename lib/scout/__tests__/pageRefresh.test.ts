import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyScoutSyncReport, applyScoutTicketsPayload } from "@/lib/scout/pageRefresh";
import { SCOUT_STORAGE_NOT_READY, scoutUiText } from "@/lib/scout/storageError";
import type { ScoutPageModel } from "@/lib/scout/view";

function model(): ScoutPageModel {
  return {
    tickets: [],
    selected: null,
    sync: { lastRunAt: null, lastSuccessAt: null, lastError: null, backfillPending: false },
    attentionCount: 0,
    seedAllowed: false,
    storageMessage: null,
    filters: { status: "all", orgTag: "all", sender: "" },
  };
}

describe("scout page refresh", () => {
  it("updates last run and the error after a sync report", () => {
    const now = "2026-10-07T16:05:00.000Z";
    const failed = applyScoutSyncReport(
      model(),
      { ok: false, error: "Gmail access not granted yet" },
      now,
    );
    assert.equal(failed.sync.lastRunAt, now);
    assert.equal(failed.sync.lastSuccessAt, null);
    assert.equal(failed.sync.lastError, "Gmail access not granted yet");

    const succeeded = applyScoutSyncReport(failed, { ok: true, error: null, backfillPending: true }, now);
    assert.equal(succeeded.sync.lastRunAt, now);
    assert.equal(succeeded.sync.lastSuccessAt, now);
    assert.equal(succeeded.sync.lastError, null);
    assert.equal(succeeded.sync.backfillPending, true);
  });

  it("leaves last run unchanged when storage is not ready", () => {
    const before = model();
    const after = applyScoutSyncReport(
      before,
      { ok: false, error: "Cannot read properties of undefined (reading 'upsert')" },
      "2026-10-07T16:05:00.000Z",
    );
    assert.equal(after.sync.lastRunAt, null);
    assert.equal(after, before);
    assert.equal(scoutUiText("Cannot read properties of undefined (reading 'upsert')"), SCOUT_STORAGE_NOT_READY);
    assert.equal(scoutUiText("Cannot read properties of undefined (reading 'slice')"), "Scout sync failed");
    assert.equal(scoutUiText("Gmail access not granted yet"), "Gmail access not granted yet");
  });

  it("replaces the ticket list and hides a stored raw error", () => {
    const next = applyScoutTicketsPayload(model(), {
      tickets: [
        {
          id: "ticket-1",
          subject: "Synthetic request",
          senderEmail: "synthetic.sender.alpha@apbaseball.com",
          senderName: null,
          lastMessageAt: "2026-10-07T16:00:00.000Z",
          status: "NEW",
          orgTag: null,
          snippet: "Synthetic snippet",
        },
      ],
      selected: null,
      sync: {
        lastRunAt: "2026-10-07T16:05:00.000Z",
        lastSuccessAt: null,
        lastError: "Cannot read properties of undefined (reading 'upsert')",
        backfillPending: false,
      },
      attentionCount: 1,
    });
    assert.equal(next.tickets.length, 1);
    assert.equal(next.attentionCount, 1);
    assert.equal(next.sync.lastRunAt, "2026-10-07T16:05:00.000Z");
    assert.equal(next.sync.lastError, SCOUT_STORAGE_NOT_READY);
    assert.equal(next.sync.lastError?.includes("Cannot read"), false);
  });
});