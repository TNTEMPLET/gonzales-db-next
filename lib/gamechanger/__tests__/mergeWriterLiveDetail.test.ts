import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeWriterLiveDetail } from "@/lib/gamechanger/mergeWriterLiveDetail";
import type { GcBracketMatchRef, GcScoreboardEvent } from "@/lib/gamechanger/types";

const bracketRef: GcBracketMatchRef = {
  id: "m1",
  home: "St. Charles",
  away: "Eastbank",
};

const event: GcScoreboardEvent = {
  id: "90ceba19-9801-4237-b9e4-7e934f69d429",
  start_ts: "2026-06-28T17:00:00.000Z",
  game_status: "live",
  home_team: { id: "h1", name: "12U St Charles", score: 3 },
  away_team: { id: "a1", name: "12U Eastbank", score: 4 },
  sport_specific: {
    bats: { inning_details: { inning: 2, half: "top" }, total_outs: 5 },
  },
};

describe("mergeWriterLiveDetail", () => {
  it("overrides count fields and batting side from writer payload", () => {
    const merged = mergeWriterLiveDetail(
      { inningLabel: "Top 2", battingSide: "away", outsInHalf: 2 },
      { balls: 2, strikes: 1, outsInHalf: 1, inning: 4, half: "bottom" },
      bracketRef,
      event,
    );
    assert.equal(merged.balls, 2);
    assert.equal(merged.strikes, 1);
    assert.equal(merged.outsInHalf, 1);
    assert.equal(merged.inningLabel, "Bot 4");
    assert.equal(merged.battingSide, "home");
  });

  it("accepts writer counts without bracket context", () => {
    const merged = mergeWriterLiveDetail({}, { balls: 3, strikes: 2, outsInHalf: 0, inning: 1, half: "top" });
    assert.equal(merged.balls, 3);
    assert.equal(merged.strikes, 2);
    assert.equal(merged.inningLabel, "Top 1");
  });
});
