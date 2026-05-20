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

  it("prefers the GC event closest to the bracket scheduled date when teams rematch", () => {
    const ref: GcBracketMatchRef = {
      id: "g2",
      home: "Velocity Trailer Rentals - Nichols",
      away: "Timeless Treasures - Snappers",
      dateLabel: "5/18",
      time: "7:15PM",
    };
    const olderRematch: GcScoreboardEvent = {
      id: "11111111-1111-4111-8111-111111111101",
      start_ts: "2026-05-16T16:30:00.000Z",
      game_status: "completed",
      home_team: { id: "h1", name: "Timeless Treasures - Snappers", score: 10 },
      away_team: { id: "a1", name: "Velocity Trailer Rentals - Nichols", score: 6 },
    };
    const tournamentGame: GcScoreboardEvent = {
      id: "22222222-2222-4222-8222-222222222202",
      start_ts: "2026-05-18T22:45:00.000Z",
      game_status: "completed",
      home_team: { id: "h2", name: "Velocity Trailer Rentals - Nichols", score: 7 },
      away_team: { id: "a2", name: "Timeless Treasures - Snappers", score: 5 },
    };
    assert.equal(
      findGcEventForBracketMatch(ref, [olderRematch, tournamentGame])?.id,
      tournamentGame.id,
    );
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
    assert.equal(payload.hasLiveGames, true);
    assert.ok(payload.nextPollMs >= 15_000);
  });
});
