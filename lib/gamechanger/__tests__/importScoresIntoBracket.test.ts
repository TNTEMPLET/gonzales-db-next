import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { gcEventToBracketMatchScores, importGcScoresIntoBracket } from "@/lib/gamechanger/importScoresIntoBracket";
import type { GcBracketMatchRef, GcScoreboardEvent } from "@/lib/gamechanger/types";
import { generateSingleEliminationRoundsFromTeams } from "@/lib/tournament-brackets/generateSingleElimFromTeams";

const EV_A = "11111111-1111-4111-8111-111111111101";
const EV_B = "22222222-2222-4222-8222-222222222202";
const EV_C = "33333333-3333-4333-8333-333333333303";
const EV_D = "44444444-4444-4444-8444-444444444404";

function completedEvent(
  id: string,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
): GcScoreboardEvent {
  return {
    id,
    start_ts: new Date().toISOString(),
    game_status: "completed",
    home_team: { id: "h", name: home, score: homeScore },
    away_team: { id: "a", name: away, score: awayScore },
  };
}

describe("importScoresIntoBracket", () => {
  it("maps GC scores onto bracket home/away with team flip", () => {
    const ref: GcBracketMatchRef = { id: "m1", home: "Bears", away: "Tigers" };
    const event = completedEvent(EV_A, "Tigers", "Bears", 2, 5);
    const scores = gcEventToBracketMatchScores(ref, event);
    assert.deepEqual(scores, { homeScore: 5, awayScore: 2, winnerSide: "home" });
  });

  it("imports completed games and advances winners", () => {
    const teams = ["A", "B", "C", "D"];
    const rounds = generateSingleEliminationRoundsFromTeams(teams);
    const spec = { version: 1 as const, teams, rounds, bracketFormat: "single_elimination" as const };
    const refs: GcBracketMatchRef[] = rounds[0]!.matches.map((m) => ({
      id: m.id,
      home: m.home,
      away: m.away,
    }));
    const eventIds = [EV_A, EV_B, EV_C, EV_D];
    const events = refs.map((r, i) => completedEvent(eventIds[i]!, r.home, r.away, 3, 1));

    const result = importGcScoresIntoBracket(spec, refs, events);
    assert.equal(result.importedMatchIds.length, refs.length);
    const r1 = result.spec.rounds[0]!.matches[0]!;
    assert.equal(r1.homeScore, 3);
    assert.equal(r1.awayScore, 1);
    assert.equal(r1.winnerSide, "home");
    const r2match = result.spec.rounds[1]!.matches[0]!;
    assert.ok(r2match.home === "A" || r2match.away === "A");
  });
});
