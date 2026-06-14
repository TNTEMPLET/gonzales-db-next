import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { isBracketSetupWizardComplete, mergeBracketSpec, parseBracketSpec, safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { resolveBracketThemeColors } from "@/lib/tournament-brackets/bracketTheme";
import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import {
  bracketSurfaceTitle,
  formatBracketGameBadge,
  formatSemiLoserSlotLabel,
  formatWinnerFeederSlotLabel,
  roundColumnScheduleHdrLines,
} from "@/lib/tournament-brackets/bracketDisplayLabels";
import {
  bracketConnectorBothForHtmlExport,
  bracketConnectorBothFromSize,
  bracketConnectorPathD,
  bracketConnectorSingleFromSize,
  getBracketConnectorVariant,
} from "@/lib/tournament-brackets/bracketConnectorPaths";
import {
  canAutoGenerateSingleEliminationRounds,
  generateSingleEliminationRoundsFromTeams,
} from "@/lib/tournament-brackets/generateSingleElimFromTeams";

function baseSpec(over: Partial<BracketSpec> = {}): BracketSpec {
  return {
    version: 1,
    teams: [],
    games: [],
    rounds: [],
    flyer: {
      includeSponsors: false,
      sponsorLayout: "none",
      sponsorStrip: [],
    },
    ingestionWarnings: [],
    bracketFormat: "unknown",
    ...over,
  };
}

describe("buildBracketLayout", () => {
  it("uses structured rounds as tree when rounds have matches", () => {
    const spec = baseSpec({
      divisionLabel: "12U",
      rounds: [
        {
          id: "r1",
          label: "Quarterfinals",
          matches: [
            { id: "m1", home: "A", away: "B" },
            { id: "m2", home: "C", away: "D" },
          ],
        },
      ],
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "tree");
    if (layout.mode !== "tree") return;
    assert.equal(layout.treeLayout, "flat");
    assert.equal(layout.rounds.length, 1);
    assert.equal(layout.rounds[0]?.matches.length, 2);
    assert.equal(layout.rounds[0]?.matches[0]?.home, "A");
  });

  it("prefers match grid when games exist even if teams are power-of-two", () => {
    const spec = baseSpec({
      bracketFormat: "single_elimination",
      teams: ["A", "B", "C", "D"],
      games: [
        {
          id: "g1",
          homeTeam: "A",
          awayTeam: "B",
        },
      ],
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "match_grid");
    if (layout.mode !== "match_grid") return;
    assert.equal(layout.games.length, 1);
  });

  it("builds seeded single-elim tree when no games and power-of-two teams", () => {
    const spec = baseSpec({
      bracketFormat: "single_elimination",
      teams: ["A", "B", "C", "D"],
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "tree");
    if (layout.mode !== "tree") return;
    assert.equal(layout.treeLayout, "connected");
    assert.ok(layout.rounds.length >= 2);
    assert.equal(layout.rounds[0]?.matches.length, 2);
    assert.equal(layout.rounds[0]?.matches[0]?.home, "A");
    assert.equal(layout.rounds[0]?.matches[0]?.away, "D");
    const last = layout.rounds[layout.rounds.length - 1];
    assert.equal(last?.matches.length, 1);
    assert.equal(last?.label, "Final");
    const finalMatch = layout.rounds[1]?.matches[0];
    assert.equal(finalMatch?.slotHome, "W1");
    assert.equal(finalMatch?.slotAway, "W2");
    assert.equal(finalMatch?.bracketGameNumber, 3);
    assert.equal(layout.podium, undefined);
  });

  it("adds podium column for seeded single elim when third-place is enabled", () => {
    const spec = baseSpec({
      bracketFormat: "single_elimination",
      singleElimIncludeThirdPlace: true,
      championAgeGroupLabel: "10U",
      teams: ["A", "B", "C", "D"],
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "tree");
    if (layout.mode !== "tree") return;
    assert.ok(layout.podium);
    assert.equal(layout.podium!.championHeading, "10U Champion");
    assert.equal(layout.podium!.thirdPlaceSlotHome, "L1");
    assert.equal(layout.podium!.thirdPlaceSlotAway, "L2");
  });

  it("links elimination rounds with W labels when halving", () => {
    const spec = baseSpec({
      rounds: [
        {
          id: "r1",
          label: "Round 1",
          matches: [
            { id: "m1", home: "Team 1", away: "Team 8" },
            { id: "m2", home: "Team 4", away: "Team 5" },
            { id: "m3", home: "Team 2", away: "Team 7" },
            { id: "m4", home: "Team 3", away: "Team 6" },
          ],
        },
        {
          id: "r2",
          label: "Round 2",
          matches: [
            { id: "w1", home: "Winner 1", away: "Winner 2" },
            { id: "w2", home: "Winner 3", away: "Winner 4" },
          ],
        },
        {
          id: "r3",
          label: "Round 3",
          matches: [{ id: "f1", home: "Winner 5", away: "Winner 6" }],
        },
      ],
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "tree");
    if (layout.mode !== "tree") return;
    assert.equal(layout.treeLayout, "connected");
    const r2m0 = layout.rounds[1]?.matches[0];
    assert.equal(r2m0?.slotHome, "W1");
    assert.equal(r2m0?.slotAway, "W2");
    assert.equal(r2m0?.bracketGameNumber, 5);
    const r3m0 = layout.rounds[2]?.matches[0];
    assert.equal(r3m0?.slotHome, "W5");
    assert.equal(r3m0?.slotAway, "W6");
  });

  it("uses officialGameNumber on feeders for W labels when set", () => {
    const spec = baseSpec({
      rounds: [
        {
          id: "r1",
          label: "Round 1",
          matches: [
            { id: "m1", home: "A", away: "H", officialGameNumber: "2" },
            { id: "m2", home: "D", away: "E", officialGameNumber: "4" },
            { id: "m3", home: "B", away: "G" },
            { id: "m4", home: "C", away: "F" },
          ],
        },
        {
          id: "r2",
          label: "Round 2",
          matches: [
            { id: "w1", home: "W1", away: "W2" },
            { id: "w2", home: "W3", away: "W4" },
          ],
        },
        {
          id: "r3",
          label: "Final",
          matches: [{ id: "f1", home: "W5", away: "W6" }],
        },
      ],
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "tree");
    if (layout.mode !== "tree") return;
    assert.equal(layout.treeLayout, "connected");
    const r2m0 = layout.rounds[1]?.matches[0];
    assert.equal(r2m0?.slotHome, "W2");
    assert.equal(r2m0?.slotAway, "W4");
    const r3m0 = layout.rounds[2]?.matches[0];
    assert.equal(r3m0?.slotHome, "W5");
    assert.equal(r3m0?.slotAway, "W6");
  });

  it("builds seeded single-elim with BYEs when team count is not a power of two", () => {
    const spec = baseSpec({
      teams: ["A", "B", "C"],
      bracketFormat: "single_elimination",
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "tree");
    if (layout.mode !== "tree") return;
    assert.equal(layout.treeLayout, "connected");
    assert.equal(layout.connectedLaneRowCount, 2);
    assert.equal(layout.rounds[0]?.layoutSlotCount, 2);
    assert.equal(layout.rounds[0]?.matches.length, 1);
    assert.equal(layout.rounds[0]?.matches[0]?.home, "B");
    assert.equal(layout.rounds[0]?.matches[0]?.away, "C");
    assert.equal(layout.rounds[0]?.matches[0]?.canonicalSlotIndex, 1);
    const finalMatch = layout.rounds[1]?.matches[0];
    assert.equal(finalMatch?.slotHome, "A");
    assert.equal(finalMatch?.slotAway, "W1");
    assert.equal(finalMatch?.bracketGameNumber, 2);
  });

  it("hides first-round bye-only games but keeps grid lanes for six teams", () => {
    const spec = baseSpec({
      teams: ["A", "B", "C", "D", "E", "F"],
      bracketFormat: "single_elimination",
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "tree");
    if (layout.mode !== "tree") return;
    assert.equal(layout.treeLayout, "connected");
    assert.equal(layout.connectedLaneRowCount, 4);
    assert.equal(layout.rounds[0]?.layoutSlotCount, 4);
    assert.equal(layout.rounds[0]?.matches.length, 2);
    const slots = layout.rounds[0]!.matches.map((m) => m.canonicalSlotIndex).sort((a, b) => a! - b!);
    assert.deepEqual(slots, [1, 3]);
  });

  it("hides bye-only games in later rounds while advancing the team into the next column", () => {
    const spec = baseSpec({
      rounds: [
        {
          id: "r1",
          label: "Semifinals",
          matches: [
            { id: "m1", home: "A", away: "BYE" },
            { id: "m2", home: "B", away: "C" },
          ],
        },
        {
          id: "r2",
          label: "Final",
          matches: [{ id: "f1", home: "W1", away: "W2" }],
        },
      ],
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "tree");
    if (layout.mode !== "tree") return;
    assert.equal(layout.treeLayout, "connected");
    assert.equal(layout.connectedLaneRowCount, 2);
    assert.equal(layout.rounds[0]?.matches.length, 1);
    assert.equal(layout.rounds[0]?.matches[0]?.canonicalSlotIndex, 1);
    const fin = layout.rounds[1]?.matches[0];
    assert.equal(fin?.slotHome, "A");
    assert.equal(fin?.slotAway, "W1");
  });

  it("returns empty when single-elim field would exceed supported auto size", () => {
    const thirtyThree = Array.from({ length: 33 }, (_, i) => `T${i + 1}`);
    const spec = baseSpec({
      teams: thirtyThree,
      bracketFormat: "single_elimination",
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "empty");
  });

  it("builds connected double elimination layout with winners, losers, and championship sections", () => {
    const spec = baseSpec({
      bracketFormat: "double_elimination",
      divisionLabel: "10U",
      rounds: [
        {
          id: "winners-r1",
          label: "Winners Bracket",
          bracketSection: "winners",
          matches: [
            { id: "g1", home: "A", away: "B", officialGameNumber: "1" },
            { id: "g2", home: "C", away: "D", officialGameNumber: "2" },
          ],
        },
        {
          id: "winners-r2",
          label: "",
          bracketSection: "winners",
          matches: [{ id: "g3", home: "W1", away: "E", officialGameNumber: "3" }],
        },
        {
          id: "winners-r3",
          label: "",
          bracketSection: "winners",
          matches: [{ id: "g6", home: "W3", away: "W2", officialGameNumber: "6" }],
        },
        {
          id: "losers-r1",
          label: "Losers Bracket",
          bracketSection: "losers",
          matches: [{ id: "g4", home: "L1", away: "L2", officialGameNumber: "4" }],
        },
        {
          id: "losers-r2",
          label: "",
          bracketSection: "losers",
          matches: [{ id: "g5", home: "W4", away: "L3", officialGameNumber: "5" }],
        },
        {
          id: "championship-r1",
          label: "Championship",
          bracketSection: "championship",
          matches: [{ id: "g7", home: "TBD", away: "TBD", officialGameNumber: "7" }],
        },
      ],
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "double_elimination");
    if (layout.mode !== "double_elimination") return;
    assert.equal(layout.winnersBracket.treeLayout, "connected");
    assert.equal(layout.winnersBracket.winnersDiagram, "five_team");
    assert.equal(layout.losersBracket?.rounds.length, 2);
    assert.equal(layout.championship?.matches.length, 1);
    const g6 = layout.winnersBracket.rounds.flatMap((r) => r.matches).find((m) => m.officialGameNumber === "6");
    assert.ok(g6);
    assert.equal(g6?.home, "W3");
    assert.equal(g6?.away, "W2");
  });

  it("maps legacy llOfficialGameNumber to officialGameNumber when parsing", () => {
    const parsed = parseBracketSpec({
      version: 1,
      teams: [],
      games: [],
      rounds: [
        {
          id: "r",
          label: "R",
          matches: [{ id: "m", home: "a", away: "b", llOfficialGameNumber: "12" }],
        },
      ],
      flyer: { includeSponsors: false, sponsorLayout: "none", sponsorStrip: [] },
      ingestionWarnings: [],
      bracketFormat: "unknown",
    });
    assert.equal(parsed.rounds[0]?.matches[0]?.officialGameNumber, "12");
  });

  it("generates standard single-elim rounds from seeded team list", () => {
    const rounds = generateSingleEliminationRoundsFromTeams(["A", "B", "C", "D"]);
    assert.equal(rounds.length, 2);
    assert.equal(rounds[0]?.matches.length, 2);
    assert.equal(rounds[0]?.matches[0]?.home, "A");
    assert.equal(rounds[0]?.matches[0]?.away, "D");
    assert.equal(rounds[0]?.matches[1]?.home, "B");
    assert.equal(rounds[0]?.matches[1]?.away, "C");
    assert.equal(rounds[1]?.matches.length, 1);
    assert.equal(rounds[1]?.label, "Final");
  });

  it("canAutoGenerateSingleEliminationRounds allows single_elim with BYE padding up to 32 slots", () => {
    assert.equal(canAutoGenerateSingleEliminationRounds(["a", "b"], "single_elimination"), true);
    assert.equal(canAutoGenerateSingleEliminationRounds(["a", "b", "c"], "single_elimination"), true);
    assert.equal(canAutoGenerateSingleEliminationRounds(["a"], "single_elimination"), true);
    assert.equal(canAutoGenerateSingleEliminationRounds(["a", "b"], "pool_play"), false);
    const thirtyThree = Array.from({ length: 33 }, (_, i) => `T${i}`);
    assert.equal(canAutoGenerateSingleEliminationRounds(thirtyThree, "single_elimination"), false);
  });

  it("pads six teams to eight slots with two BYEs using standard pairings", () => {
    const rounds = generateSingleEliminationRoundsFromTeams(["A", "B", "C", "D", "E", "F"]);
    assert.equal(rounds[0]?.matches.length, 4);
    assert.equal(rounds[0]?.matches[0]?.home, "A");
    assert.equal(rounds[0]?.matches[0]?.away, "BYE");
    assert.equal(rounds[0]?.matches[1]?.home, "D");
    assert.equal(rounds[0]?.matches[1]?.away, "E");
    assert.equal(rounds[0]?.matches[2]?.home, "B");
    assert.equal(rounds[0]?.matches[2]?.away, "BYE");
    assert.equal(rounds[0]?.matches[3]?.home, "C");
    assert.equal(rounds[0]?.matches[3]?.away, "F");
  });
});

describe("bracket display labels", () => {
  it("formats bracket surface title without a trailing period on the division label", () => {
    assert.equal(
      bracketSurfaceTitle("GONZALES DIAMOND YOUTH - 12U - EOY TOURNAMENT."),
      "GONZALES DIAMOND YOUTH - 12U - EOY TOURNAMENT",
    );
    assert.equal(bracketSurfaceTitle("12U"), "12U");
    assert.equal(bracketSurfaceTitle(undefined), "");
    assert.equal(bracketSurfaceTitle("12U", "Games (4)"), "12U — Games (4)");
    assert.equal(bracketSurfaceTitle(undefined, "Games (2)"), "Games (2)");
  });

  it("formats game badge and winner feeder placeholders", () => {
    assert.equal(formatBracketGameBadge(undefined), undefined);
    assert.equal(formatBracketGameBadge("  12 "), "G12");
    assert.equal(formatWinnerFeederSlotLabel({ officialGameNumber: "7" }, 99), "W7");
    assert.equal(formatWinnerFeederSlotLabel({}, 3), "W3");
  });

  it("formats semi loser slot labels from official or bracket game numbers", () => {
    assert.equal(formatSemiLoserSlotLabel({ officialGameNumber: "9" }), "L9");
    assert.equal(formatSemiLoserSlotLabel({ bracketGameNumber: 2 }), "L2");
    assert.equal(formatSemiLoserSlotLabel({}), "TBD");
  });

  it("uses placeholder game information for column headers when schedule is unset", () => {
    const empty = roundColumnScheduleHdrLines([]);
    assert.equal(empty.isPlaceholder, true);
    assert.equal(empty.when, "Sat 6/7 · 6:00 PM");
    assert.equal(empty.where, "Field 2 · Main complex");

    const scheduled = roundColumnScheduleHdrLines([
      { dateLabel: "Sun 6/8", time: "7:00 PM", field: "Field 1", venue: "Park A" },
    ]);
    assert.equal(scheduled.isPlaceholder, false);
    assert.equal(scheduled.when, "Sun 6/8 · 7:00 PM");
    assert.equal(scheduled.where, "Field 1 · Park A");
  });
});

describe("bracket connector paths", () => {
  it("builds both-feeder geometry with viewBox matching cell aspect (uniform scale)", () => {
    assert.equal(getBracketConnectorVariant(true, true), "both");
    assert.equal(bracketConnectorPathD("both"), null);
    const square = bracketConnectorBothFromSize(100, 100);
    assert.equal(square.viewBox, "0 0 40 40");
    // Hub at 50%: vertical center of the gutter / destination match; arms at 25% & 75%.
    assert.ok(square.d.includes("L 40 20"));
    const tall = bracketConnectorBothFromSize(40, 400);
    assert.equal(tall.viewBox, "0 0 40 400");
    assert.ok(tall.d.includes("L 40 200"));
    const exp = bracketConnectorBothForHtmlExport();
    assert.ok(exp.viewBox.startsWith("0 0 40 "));
    assert.ok(exp.d.startsWith("M 2 "));
    const single = bracketConnectorSingleFromSize(100, 100, "top");
    assert.equal(single.viewBox, "0 0 40 40");
    assert.ok(single.d.includes("L 40 20"));
  });

  it("returns single-arm SVG paths when one feeder is an empty bye band", () => {
    assert.equal(getBracketConnectorVariant(false, true), "bottom");
    assert.equal(getBracketConnectorVariant(true, false), "top");
    assert.ok(bracketConnectorPathD("bottom")!.includes("75"));
    assert.ok(bracketConnectorPathD("top")!.includes("25"));
    assert.ok(bracketConnectorPathD("top")!.includes("50"));
    assert.equal(bracketConnectorPathD("none"), null);
  });
});

describe("bracket theme", () => {
  it("resolveBracketThemeColors uses site defaults when spec omits overrides", () => {
    const spec = baseSpec({});
    assert.deepEqual(resolveBracketThemeColors(spec, { primaryHex: "#111111", accentHex: "#222222" }), {
      primaryHex: "#111111",
      accentHex: "#222222",
    });
  });

  it("mergeBracketSpec clears theme overrides when null is sent", () => {
    const cur = baseSpec({
      bracketThemePrimaryHex: "#ff0000",
      bracketThemeAccentHex: "#00ff00",
    });
    const merged = mergeBracketSpec(cur, { bracketThemePrimaryHex: null });
    assert.equal(merged.bracketThemePrimaryHex, undefined);
    assert.equal(merged.bracketThemeAccentHex, "#00ff00");
  });

  it("mergeBracketSpec clears rosterAgeGroup when null is sent", () => {
    const cur = baseSpec({
      setupWizardCompleted: true,
      rosterAgeGroup: "9U",
      rounds: [
        {
          id: "r1",
          label: "Round 1",
          matches: [{ id: "m1", home: "A", away: "B", time: "6:00 PM" }],
        },
      ],
    });
    const merged = mergeBracketSpec(cur, {
      rounds: cur.rounds,
      rosterAgeGroup: null,
    });
    assert.equal(merged.rosterAgeGroup, undefined);
    assert.equal(merged.rounds.length, 1);
  });

  it("mergeBracketSpec throws instead of wiping when a match time exceeds max length", () => {
    const cur = baseSpec({
      setupWizardCompleted: true,
      bracketFormat: "single_elimination",
      rounds: [
        {
          id: "r1",
          label: "Round 1",
          matches: [{ id: "m1", home: "A", away: "B" }],
        },
      ],
    });
    assert.throws(
      () =>
        mergeBracketSpec(cur, {
          rounds: [
            {
              id: "r1",
              label: "Round 1",
              matches: [{ id: "m1", home: "A", away: "B", time: "x".repeat(81) }],
            },
          ],
        }),
      /Bracket save rejected/,
    );
    assert.equal(cur.rounds.length, 1);
  });

  it("mergeBracketSpec preserves gameChanger pins when widgetId is updated", () => {
    const widgetId = "58152785-6fd8-4c3a-be34-187a3fdf97ff";
    const pinId = "90ceba19-9801-4237-b9e4-7e934f69d429";
    const cur = baseSpec({
      gameChanger: {
        widgetId,
        matchEventPins: { m1: pinId },
        importedFinalEventIds: [pinId],
        autoImportFinalScores: true,
      },
    });
    const merged = mergeBracketSpec(cur, {
      gameChanger: { widgetId, maxVerticalGamesVisible: 6 },
    });
    assert.equal(merged.gameChanger?.widgetId, widgetId);
    assert.equal(merged.gameChanger?.matchEventPins?.m1, pinId);
    assert.deepEqual(merged.gameChanger?.importedFinalEventIds, [pinId]);
    assert.equal(merged.gameChanger?.maxVerticalGamesVisible, 6);
  });

  it("mergeBracketSpec with thirdPlaceGame null keeps bracket rounds (score save patch)", () => {
    const cur = baseSpec({
      setupWizardCompleted: true,
      bracketFormat: "single_elimination",
      rounds: [
        {
          id: "r1",
          label: "Round 1",
          matches: [{ id: "m1", home: "A", away: "B", homeScore: 5, awayScore: 2 }],
        },
      ],
    });
    const merged = mergeBracketSpec(cur, {
      rounds: cur.rounds,
      thirdPlaceGame: null,
    });
    assert.equal(isBracketSetupWizardComplete(merged), true);
    assert.equal(merged.rounds.length, 1);
    assert.equal(merged.rounds[0]!.matches[0]!.homeScore, 5);
    assert.equal(merged.thirdPlaceGame, undefined);
  });
});

describe("safeParseBracketSpec", () => {
  it("returns ok:false and issues when document is invalid", () => {
    const r = safeParseBracketSpec({ version: 1, thirdPlaceGame: null });
    assert.equal(r.ok, false);
    assert.ok(r.issues.length > 0);
    assert.equal(r.spec.rounds.length, 0);
  });
});

describe("isBracketSetupWizardComplete", () => {
  it("is false for empty parsed spec", () => {
    assert.equal(isBracketSetupWizardComplete(parseBracketSpec({})), false);
  });

  it("is true when setupWizardCompleted flag is set", () => {
    assert.equal(isBracketSetupWizardComplete(parseBracketSpec({ setupWizardCompleted: true })), true);
  });

  it("is true when games exist (legacy)", () => {
    assert.equal(
      isBracketSetupWizardComplete(
        parseBracketSpec({
          games: [{ id: "g", homeTeam: "A", awayTeam: "B" }],
        }),
      ),
      true,
    );
  });

  it("is true when rounds have matches (legacy)", () => {
    assert.equal(
      isBracketSetupWizardComplete(
        parseBracketSpec({
          rounds: [{ id: "r", label: "R1", matches: [{ id: "m", home: "A", away: "B" }] }],
        }),
      ),
      true,
    );
  });
});
