import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findUnlockedScheduleManagerGames,
  isBracketEligibleForScheduleManager,
} from "@/lib/gamechanger/schedule-manager/decisionEngine";
import { mergeMatchScoresIntoSpec } from "@/lib/tournament-brackets/bracketScoring";
import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { generateSingleEliminationRoundsFromTeams } from "@/lib/tournament-brackets/generateSingleElimFromTeams";

const WIDGET_ID = "11111111-1111-4111-8111-111111111111";

function baseSpec(enabled = true): BracketSpec {
  const teams = ["Aces", "Bears", "Cats", "Dogs"];
  const rounds = generateSingleEliminationRoundsFromTeams(teams);
  rounds[1]!.matches[0]!.dateLabel = "6/27";
  rounds[1]!.matches[0]!.time = "6:00 PM";
  rounds[1]!.matches[0]!.field = "Field 1";
  return {
    version: 1,
    teams,
    rounds,
    games: [],
    bracketFormat: "single_elimination",
    layoutPreference: "official",
    flyer: { includeSponsors: false, sponsorLayout: "none", sponsorStrip: [] },
    ingestionWarnings: [],
    divisionLabel: "10U",
    gameChanger: {
      widgetId: WIDGET_ID,
      scheduleManagerEnabled: enabled,
    },
  };
}

function completedSemifinalSpec(): BracketSpec {
  const spec = baseSpec();
  const first = spec.rounds[0]!.matches[0]!;
  const second = spec.rounds[0]!.matches[1]!;
  return mergeMatchScoresIntoSpec(spec, {
    [first.id]: { homeScore: 7, awayScore: 2, winnerSide: "home" },
    [second.id]: { homeScore: 5, awayScore: 3, winnerSide: "home" },
  });
}

describe("schedule manager decision engine", () => {
  it("plans a newly unlocked next game after previous games are finalized", () => {
    const spec = completedSemifinalSpec();
    const final = spec.rounds[1]!.matches[0]!;
    const result = findUnlockedScheduleManagerGames({
      bracketProjectId: "bracket-1",
      seasonYear: 2026,
      spec,
    });

    assert.equal(result.planned.length, 1);
    assert.equal(result.planned[0]!.matchId, final.id);
    assert.equal(result.planned[0]!.homeTeam, "Aces");
    assert.equal(result.planned[0]!.awayTeam, "Bears");
  });

  it("does not plan a game while one side is still a bracket placeholder", () => {
    const spec = baseSpec();
    const first = spec.rounds[0]!.matches[0]!;
    const partial = mergeMatchScoresIntoSpec(spec, {
      [first.id]: { homeScore: 7, awayScore: 2, winnerSide: "home" },
    });
    const final = partial.rounds[1]!.matches[0]!;
    const result = findUnlockedScheduleManagerGames({
      bracketProjectId: "bracket-1",
      seasonYear: 2026,
      spec: partial,
    });

    assert.equal(result.planned.some((game) => game.matchId === final.id), false);
    assert.equal(result.skipped.some((game) => game.matchId === final.id && game.reason === "placeholder_team"), true);
  });

  it("skips duplicate create actions by match id", () => {
    const spec = completedSemifinalSpec();
    const final = spec.rounds[1]!.matches[0]!;
    const result = findUnlockedScheduleManagerGames({
      bracketProjectId: "bracket-1",
      seasonYear: 2026,
      spec,
      existingActionMatchIds: [final.id],
    });

    assert.equal(result.planned.length, 0);
    assert.equal(result.skipped.some((game) => game.matchId === final.id && game.reason === "already_logged"), true);
  });

  it("ignores brackets without a GameChanger connection", () => {
    const spec = completedSemifinalSpec();
    delete spec.gameChanger;
    const result = findUnlockedScheduleManagerGames({
      bracketProjectId: "bracket-1",
      seasonYear: 2026,
      spec,
    });

    assert.equal(result.planned.length, 0);
  });

  it("requires READY status, GameChanger, and explicit enablement for eligibility", () => {
    assert.equal(isBracketEligibleForScheduleManager("READY", baseSpec(true)), true);
    assert.equal(isBracketEligibleForScheduleManager("DRAFT", baseSpec(true)), false);
    assert.equal(isBracketEligibleForScheduleManager("ARCHIVED", baseSpec(true)), false);
    assert.equal(isBracketEligibleForScheduleManager("READY", baseSpec(false)), false);
  });
});
