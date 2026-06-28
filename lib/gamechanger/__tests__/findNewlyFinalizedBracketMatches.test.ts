import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findNewlyFinalizedBracketMatchIds,
  markFinalizedEventIds,
} from "@/lib/gamechanger/findNewlyFinalizedBracketMatches";
import type { GcBracketMatchRef, GcScoreboardEvent } from "@/lib/gamechanger/types";

const ref = (id: string): GcBracketMatchRef => ({
  id,
  home: "Home",
  away: "Away",
});

function completedEvent(id: string): GcScoreboardEvent {
  return {
    id,
    game_status: "completed",
    start_ts: "2026-06-27T17:00:00.000Z",
    home_team: { id: "h1", name: "Home", score: 5 },
    away_team: { id: "a1", name: "Away", score: 3 },
  };
}

describe("findNewlyFinalizedBracketMatchIds", () => {
  it("returns matches with completed events not yet in importedFinalEventIds", () => {
    const matches = findNewlyFinalizedBracketMatchIds(
      [ref("m1"), ref("m2")],
      {
        eventsByMatchId: {
          m1: completedEvent("ev-1"),
          m2: completedEvent("ev-2"),
        },
      },
      new Set(["ev-2"]),
    );
    assert.deepEqual(matches, ["m1"]);
  });

  it("marks finalized event ids even when scores were unchanged", () => {
    const imported = new Set<string>();
    markFinalizedEventIds(
      [ref("m1")],
      { eventsByMatchId: { m1: completedEvent("ev-1") } },
      ["m1"],
      imported,
    );
    assert.equal(imported.has("ev-1"), true);
  });
});
