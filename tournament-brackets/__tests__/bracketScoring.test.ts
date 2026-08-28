import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import {
  clearBracketScoringFromSpec,
  isByeBracketMatch,
  mergeMatchScoresIntoSpec,
  resolveBracketMatchOutcome,
  resolveDoubleElimChampionTeamName,
  specHasSavedScores,
} from "@/lib/tournament-brackets/bracketScoring";
import { parseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { generateSingleEliminationRoundsFromTeams } from "@/lib/tournament-brackets/generateSingleElimFromTeams";
import { generateDoubleEliminationRoundsForFormat, generateDoubleEliminationRoundsFromTeams } from "@/lib/tournament-brackets/generateDoubleElimFromTeams";

function matchByGame(spec: ReturnType<typeof parseBracketSpec>, gameNum: number) {
  for (const r of spec.rounds) {
    for (const m of r.matches) {
      if (m.officialGameNumber === String(gameNum)) return m;
    }
  }
  throw new Error(`Game ${gameNum} not found`);
}

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

  it("advances 8-team double elimination through winners and losers feeders", () => {
    const teams = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];
    const rounds = generateDoubleEliminationRoundsFromTeams(teams);
    let spec = parseBracketSpec({
      bracketFormat: "double_elimination",
      championshipSeriesStyle: "always_scheduled_reset",
      teams,
      rounds,
      setupWizardCompleted: true,
    });

    spec = mergeMatchScoresIntoSpec(spec, {
      [matchByGame(spec, 1).id]: { homeScore: 5, awayScore: 1 },
      [matchByGame(spec, 2).id]: { homeScore: 3, awayScore: 2 },
      [matchByGame(spec, 3).id]: { homeScore: 4, awayScore: 0 },
      [matchByGame(spec, 4).id]: { homeScore: 2, awayScore: 6 },
    });

    const g8 = matchByGame(spec, 8);
    assert.equal(g8.home, "T8");
    assert.equal(g8.away, "T4");

    spec = mergeMatchScoresIntoSpec(spec, {
      [matchByGame(spec, 5).id]: { homeScore: 1, awayScore: 0 },
      [matchByGame(spec, 6).id]: { homeScore: 0, awayScore: 2 },
    });

    const g10 = matchByGame(spec, 10);
    assert.equal(g10.away, "T6");

    spec = mergeMatchScoresIntoSpec(spec, {
      [g8.id]: { homeScore: 3, awayScore: 1 },
      [matchByGame(spec, 9).id]: { homeScore: 2, awayScore: 4 },
      [matchByGame(spec, 7).id]: { homeScore: 5, awayScore: 3 },
      [g10.id]: { homeScore: 1, awayScore: 0 },
      [matchByGame(spec, 11).id]: { homeScore: 0, awayScore: 4 },
    });

    const g12 = matchByGame(spec, 12);
    assert.equal(g12.home, "T1");
    assert.equal(g12.away, "T3");
  });

  it("sets champion when winners-bracket champ wins grand final", () => {
    const teams = ["A", "B", "C", "D"];
    const rounds = generateDoubleEliminationRoundsFromTeams(teams);
    let spec = parseBracketSpec({
      bracketFormat: "double_elimination",
      teams,
      rounds,
      setupWizardCompleted: true,
    });

    for (const g of [1, 2, 3, 4, 5]) {
      const m = matchByGame(spec, g);
      spec = mergeMatchScoresIntoSpec(spec, {
        [m.id]: { homeScore: 3, awayScore: 1 },
      });
    }

    const gf = matchByGame(spec, 6);
    assert.equal(gf.home, "A");
    spec = mergeMatchScoresIntoSpec(spec, {
      [gf.id]: { homeScore: 5, awayScore: 2 },
    });

    assert.equal(spec.championTeamName, "A");
    const ifNecessary = matchByGame(spec, 7);
    assert.equal(ifNecessary.home, "W6");
    assert.equal(ifNecessary.away, "L6");
    assert.equal(ifNecessary.homeScore, undefined);
  });

  it("requires if-necessary game when losers-bracket champ wins grand final", () => {
    const teams = ["A", "B", "C", "D"];
    const rounds = generateDoubleEliminationRoundsFromTeams(teams);
    let spec = parseBracketSpec({
      bracketFormat: "double_elimination",
      teams,
      rounds,
      setupWizardCompleted: true,
    });

    spec = mergeMatchScoresIntoSpec(spec, {
      [matchByGame(spec, 1).id]: { homeScore: 5, awayScore: 1 },
      [matchByGame(spec, 2).id]: { homeScore: 1, awayScore: 4 },
      [matchByGame(spec, 3).id]: { homeScore: 5, awayScore: 2 },
      [matchByGame(spec, 4).id]: { homeScore: 1, awayScore: 3 },
      [matchByGame(spec, 5).id]: { homeScore: 4, awayScore: 2 },
    });

    const gf = matchByGame(spec, 6);
    assert.equal(gf.home, "A");
    assert.equal(gf.away, "C");
    spec = mergeMatchScoresIntoSpec(spec, {
      [gf.id]: { homeScore: 1, awayScore: 4 },
    });

    const reset = matchByGame(spec, 7);
    assert.equal(reset.home, "A");
    assert.equal(reset.away, "C");
    assert.equal(spec.championTeamName, undefined);

    spec = mergeMatchScoresIntoSpec(spec, {
      [reset.id]: { homeScore: 2, awayScore: 5 },
    });
    assert.equal(spec.championTeamName, "C");
  });

  it("resolveDoubleElimChampionTeamName uses G8 when if-necessary is not required", () => {
    const teams = ["A", "B", "C", "D"];
    const rounds = generateDoubleEliminationRoundsFromTeams(teams);
    let spec = parseBracketSpec({
      bracketFormat: "double_elimination",
      teams,
      rounds,
      setupWizardCompleted: true,
    });
    for (const g of [1, 2, 3, 4, 5]) {
      spec = mergeMatchScoresIntoSpec(spec, {
        [matchByGame(spec, g).id]: { homeScore: 3, awayScore: 1 },
      });
    }
    spec = mergeMatchScoresIntoSpec(spec, {
      [matchByGame(spec, 6).id]: { homeScore: 5, awayScore: 2 },
    });
    delete spec.championTeamName;

    assert.equal(resolveDoubleElimChampionTeamName(spec), "A");
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "double_elimination");
    if (layout.mode !== "double_elimination") return;
    assert.equal(layout.classicChampionshipPodium?.championTeamName, "A");
  });

  it("resolveDoubleElimChampionTeamName uses G9 when if-necessary is played", () => {
    const teams = ["A", "B", "C", "D"];
    const rounds = generateDoubleEliminationRoundsFromTeams(teams);
    let spec = parseBracketSpec({
      bracketFormat: "double_elimination",
      teams,
      rounds,
      setupWizardCompleted: true,
    });
    for (const g of [1, 2, 3, 4, 5]) {
      spec = mergeMatchScoresIntoSpec(spec, {
        [matchByGame(spec, g).id]: { homeScore: 3, awayScore: 1 },
      });
    }
    spec = mergeMatchScoresIntoSpec(spec, {
      [matchByGame(spec, 6).id]: { homeScore: 2, awayScore: 5 },
    });
    assert.equal(resolveDoubleElimChampionTeamName(spec), null);
    spec = mergeMatchScoresIntoSpec(spec, {
      [matchByGame(spec, 7).id]: { homeScore: 4, awayScore: 6 },
    });
    assert.equal(resolveDoubleElimChampionTeamName(spec), "C");
  });

  it("modified double elimination crowns grand final winner with no reset game", () => {
    const teams = ["A", "B", "C", "D"];
    const rounds = generateDoubleEliminationRoundsForFormat(teams, "modified_double_elimination");
    let spec = parseBracketSpec({
      bracketFormat: "modified_double_elimination",
      championshipSeriesStyle: "winner_take_all",
      teams,
      rounds,
      setupWizardCompleted: true,
    });

    spec = mergeMatchScoresIntoSpec(spec, {
      [matchByGame(spec, 1).id]: { homeScore: 5, awayScore: 1 },
      [matchByGame(spec, 2).id]: { homeScore: 1, awayScore: 4 },
      [matchByGame(spec, 3).id]: { homeScore: 5, awayScore: 2 },
      [matchByGame(spec, 4).id]: { homeScore: 1, awayScore: 3 },
      [matchByGame(spec, 5).id]: { homeScore: 4, awayScore: 2 },
    });

    const gf = matchByGame(spec, 6);
    assert.equal(gf.home, "A");
    assert.equal(gf.away, "C");
    spec = mergeMatchScoresIntoSpec(spec, {
      [gf.id]: { homeScore: 1, awayScore: 4 },
    });

    assert.equal(spec.championTeamName, "C");
    assert.throws(() => matchByGame(spec, 7));
  });
});
