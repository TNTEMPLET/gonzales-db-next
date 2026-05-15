import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import {
  clearBracketScoringFromSpec,
  isByeBracketMatch,
  mergeMatchScoresIntoSpec,
  resolveBracketMatchOutcome,
  specHasSavedScores,
} from "@/lib/tournament-brackets/bracketScoring";
import { parseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { generateSingleEliminationRoundsFromTeams } from "@/lib/tournament-brackets/generateSingleElimFromTeams";

describe("bracketScoring", () => {
  it("resolves bye matches without scores", () => {
    const m = { id: "b", home: "BYE", away: "Eagles", homeScore: undefined, awayScore: undefined };
    assert.equal(isByeBracketMatch(m), true);
    const o = resolveBracketMatchOutcome(m);
    assert.equal(o?.winnerName, "Eagles");
  });

  it("advances winner into the next round after scores are saved", () => {
    const rounds = generateSingleEliminationRoundsFromTeams(["A", "B", "C", "D"]);
    let spec = parseBracketSpec({
      bracketFormat: "single_elimination",
      teams: ["A", "B", "C", "D"],
      rounds,
      setupWizardCompleted: true,
    });
    const r0m0 = spec.rounds[0]!.matches[0]!;
    const r0m1 = spec.rounds[0]!.matches[1]!;
    spec = mergeMatchScoresIntoSpec(spec, {
      [r0m0.id]: { homeScore: 5, awayScore: 2 },
      [r0m1.id]: { homeScore: 1, awayScore: 4 },
    });
    const m0 = spec.rounds[0]!.matches.find((m) => m.id === r0m0.id)!;
    const m1 = spec.rounds[0]!.matches.find((m) => m.id === r0m1.id)!;
    const semi = spec.rounds[1]!.matches[0]!;
    const o0 = resolveBracketMatchOutcome(m0)!;
    const o1 = resolveBracketMatchOutcome(m1)!;
    assert.equal(semi.home, o0.winnerName);
    assert.equal(semi.away, o1.winnerName);
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "tree");
    if (layout.mode === "tree") {
      const displayed = layout.rounds[1]!.matches[0]!;
      assert.equal(displayed.slotHome, o0.winnerName);
      assert.equal(displayed.slotAway, o1.winnerName);
    }
  });

  it("fills third-place teams when semifinals are scored", () => {
    const rounds = generateSingleEliminationRoundsFromTeams(["A", "B", "C", "D", "E", "F", "G", "H"]);
    let spec = parseBracketSpec({
      bracketFormat: "single_elimination",
      singleElimIncludeThirdPlace: true,
      teams: ["A", "B", "C", "D", "E", "F", "G", "H"],
      rounds,
      setupWizardCompleted: true,
    });
    const r0 = spec.rounds[0]!.matches;
    for (const m of r0) {
      spec = mergeMatchScoresIntoSpec(spec, { [m.id]: { homeScore: 3, awayScore: 1 } });
    }
    const sf = spec.rounds[1]!.matches;
    spec = mergeMatchScoresIntoSpec(spec, {
      [sf[0]!.id]: { homeScore: 2, awayScore: 0 },
      [sf[1]!.id]: { homeScore: 0, awayScore: 5 },
    });
    assert.ok(spec.thirdPlaceGame);
    assert.equal(spec.thirdPlaceGame!.home.length > 0, true);
    assert.equal(spec.thirdPlaceGame!.away.length > 0, true);
  });

  it("clearBracketScoringFromSpec removes scores and resets later rounds for single elimination", () => {
    const rounds = generateSingleEliminationRoundsFromTeams(["A", "B", "C", "D"]);
    let spec = parseBracketSpec({
      bracketFormat: "single_elimination",
      teams: ["A", "B", "C", "D"],
      rounds,
      setupWizardCompleted: true,
    });
    const r0m0 = spec.rounds[0]!.matches[0]!;
    const r0m1 = spec.rounds[0]!.matches[1]!;
    spec = mergeMatchScoresIntoSpec(spec, {
      [r0m0.id]: { homeScore: 5, awayScore: 2 },
      [r0m1.id]: { homeScore: 1, awayScore: 4 },
    });
    assert.equal(specHasSavedScores(spec), true);
    const semi = spec.rounds[1]!.matches[0]!;
    assert.notEqual(semi.home, "TBD");

    const cleared = clearBracketScoringFromSpec(spec);
    assert.equal(specHasSavedScores(cleared), false);
    for (const m of cleared.rounds[0]!.matches) {
      assert.equal(m.homeScore, undefined);
      assert.equal(m.awayScore, undefined);
      assert.equal(m.winnerSide, undefined);
    }
    const semiAfter = cleared.rounds[1]!.matches[0]!;
    assert.equal(semiAfter.home, "TBD");
    assert.equal(semiAfter.away, "TBD");
  });

  it("clearBracketScoringFromSpec drops third-place game data after semis were scored", () => {
    const rounds = generateSingleEliminationRoundsFromTeams(["A", "B", "C", "D", "E", "F", "G", "H"]);
    let spec = parseBracketSpec({
      bracketFormat: "single_elimination",
      singleElimIncludeThirdPlace: true,
      teams: ["A", "B", "C", "D", "E", "F", "G", "H"],
      rounds,
      setupWizardCompleted: true,
    });
    const r0 = spec.rounds[0]!.matches;
    for (const m of r0) {
      spec = mergeMatchScoresIntoSpec(spec, { [m.id]: { homeScore: 3, awayScore: 1 } });
    }
    const sf = spec.rounds[1]!.matches;
    spec = mergeMatchScoresIntoSpec(spec, {
      [sf[0]!.id]: { homeScore: 2, awayScore: 0 },
      [sf[1]!.id]: { homeScore: 0, awayScore: 5 },
    });
    assert.ok(spec.thirdPlaceGame);
    assert.equal(specHasSavedScores(spec), true);

    const cleared = clearBracketScoringFromSpec(spec);
    assert.equal(cleared.thirdPlaceGame, undefined);
    assert.equal(specHasSavedScores(cleared), false);
  });
});
