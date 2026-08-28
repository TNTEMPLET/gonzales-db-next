import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { liveBaseballSituationFromEvent } from "@/lib/gamechanger/liveBaseballSituation";
import type { GcBracketMatchRef, GcScoreboardEvent } from "@/lib/gamechanger/types";

const bracketRef: GcBracketMatchRef = {
  id: "m1",
  home: "St. Charles",
  away: "Eastbank",
};

const liveBottomEvent: GcScoreboardEvent = {
  id: "90ceba19-9801-4237-b9e4-7e934f69d429",
  start_ts: "2026-06-28T17:00:00.000Z",
  game_status: "live",
  home_team: { id: "h1", name: "12U St Charles", score: 3 },
  away_team: { id: "a1", name: "12U Eastbank", score: 4 },
  sport_specific: {
    bats: {
      inning_details: { inning: 4, half: "bottom" },
      total_outs: 23,
      balls: 2,
      strikes: 1,
    },
  },
};

describe("liveBaseballSituationFromEvent", () => {
  it("maps bottom half to home team batting on bracket", () => {
    const situation = liveBaseballSituationFromEvent(liveBottomEvent, bracketRef);
    assert.equal(situation.inningLabel, "Bot 4");
    assert.equal(situation.battingSide, "home");
    assert.equal(situation.outsInHalf, 2);
    assert.equal(situation.balls, 2);
    assert.equal(situation.strikes, 1);
  });

  it("maps top half to away team batting", () => {
    const event: GcScoreboardEvent = {
      ...liveBottomEvent,
      sport_specific: {
        bats: { inning_details: { inning: 2, half: "top" }, total_outs: 5 },
      },
    };
    const situation = liveBaseballSituationFromEvent(event, bracketRef);
    assert.equal(situation.battingSide, "away");
    assert.equal(situation.outsInHalf, 2);
  });

  it("flips batting side when GC home/away is reversed from bracket", () => {
    const flippedBracket: GcBracketMatchRef = {
      id: "m1",
      home: "Eastbank",
      away: "St. Charles",
    };
    const situation = liveBaseballSituationFromEvent(liveBottomEvent, flippedBracket);
    assert.equal(situation.battingSide, "away");
  });
});
