import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLivePayloadFromEvents,
  findGcEventForBracketMatch,
  normalizeTeamNameForMatch,
} from "@/lib/gamechanger/matchEventsToBracket";
import type { GcBracketMatchRef, GcScoreboardEvent } from "@/lib/gamechanger/types";

const sampleEvent: GcScoreboardEvent = {
  id: "90ceba19-9801-4237-b9e4-7e934f69d429",
  start_ts: "2026-05-19T00:15:00.000Z",
  game_status: "live",
  home_team: { id: "h1", name: "Highway 44 Paint and Body - Little", score: 3 },
  away_team: { id: "a1", name: "Ascension Paper - Aderholt", score: 2 },
  sport_specific: {
    bats: { inning_details: { inning: 4, half: "bottom" } },
  },
};

describe("normalizeTeamNameForMatch", () => {
  it("normalizes punctuation and case", () => {
    assert.equal(normalizeTeamNameForMatch("Barado's Plumbing - Ezell"), "barados plumbing - ezell");
  });
});

describe("findGcEventForBracketMatch", () => {
  const ref: GcBracketMatchRef = {
    id: "m1",
    home: "Ascension Paper - Aderholt",
    away: "Highway 44 Paint and Body - Little",
  };

  it("matches teams in either home/away orientation", () => {
    assert.equal(findGcEventForBracketMatch(ref, [sampleEvent])?.id, sampleEvent.id);
  });

  it("skips bye placeholders", () => {
    assert.equal(findGcEventForBracketMatch({ id: "b", home: "BYE", away: "Team A" }, [sampleEvent]), undefined);
  });
});

describe("buildLivePayloadFromEvents", () => {
  it("marks live games with score and inning labels", () => {
    const ref: GcBracketMatchRef = {
      id: "m1",
      home: "Highway 44 Paint and Body - Little",
      away: "Ascension Paper - Aderholt",
    };
    const payload = buildLivePayloadFromEvents([ref], [sampleEvent], "2026-05-19T18:00:00.000Z");
    assert.equal(payload.liveGameStatuses.m1?.statusLabel, "LIVE");
    assert.equal(payload.liveGameStatuses.m1?.scoreLabel, "3–2");
    assert.match(payload.liveGameStatuses.m1?.inningLabel ?? "", /Bot/);
    assert.equal(payload.matchEventIds.m1, sampleEvent.id);
    assert.equal(payload.eventsByMatchId.m1?.id, sampleEvent.id);
    assert.ok(payload.nextPollMs >= 15_000);
  });
});
