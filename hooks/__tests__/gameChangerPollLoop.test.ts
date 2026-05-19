import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GC_POST_LIVE_FOLLOWUP_MS, scheduleNextGcPoll } from "@/hooks/gameChangerPollLoop";

describe("scheduleNextGcPoll", () => {
  it("polls on interval while games are live", () => {
    const result = scheduleNextGcPoll({
      hasLiveGames: true,
      nextPollMs: 30_000,
      hadLiveGames: false,
      postLiveFollowUpPending: false,
    });
    assert.equal(result.delayMs, 30_000);
    assert.equal(result.hadLiveGames, true);
  });

  it("stops polling when idle from the start", () => {
    const result = scheduleNextGcPoll({
      hasLiveGames: false,
      nextPollMs: 30_000,
      hadLiveGames: false,
      postLiveFollowUpPending: false,
    });
    assert.equal(result.delayMs, null);
  });

  it("schedules one follow-up after live games end", () => {
    const result = scheduleNextGcPoll({
      hasLiveGames: false,
      nextPollMs: 30_000,
      hadLiveGames: true,
      postLiveFollowUpPending: false,
    });
    assert.equal(result.delayMs, GC_POST_LIVE_FOLLOWUP_MS);
    assert.equal(result.postLiveFollowUpPending, true);
  });

  it("stops after the post-live follow-up", () => {
    const result = scheduleNextGcPoll({
      hasLiveGames: false,
      nextPollMs: 30_000,
      hadLiveGames: false,
      postLiveFollowUpPending: true,
    });
    assert.equal(result.delayMs, null);
  });
});
