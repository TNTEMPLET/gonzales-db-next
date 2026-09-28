import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBracketLayout, resolveDoubleElimRenderSlots } from "@/lib/tournament-brackets/bracketLayout";
import { mergeMatchScoresIntoSpec } from "@/lib/tournament-brackets/bracketScoring";
import { buildRoundsFromOfficialTemplate, specDefaultsFromOfficialTemplate } from "@/lib/tournament-brackets/officialTemplates";
import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import type { BracketLiveGameStatus } from "@/components/brackets/TournamentBracketView";

/**
 * Enumeration this suite exists to prove (see resolveDoubleElimRenderSlots' doc comment
 * for the source-of-truth statement): `TournamentBracketView`'s `DoubleEliminationBracketView`
 * memoizes its classic-diagram slot resolution with `useMemo(() => resolveDoubleElimRenderSlots(layout), [layout])`.
 *
 * - Fields that MUST invalidate the memo: any of `layout.winnersBracket`, `layout.losersBracket`,
 *   `layout.championship`, `layout.classicChampionshipPodium.ifNecessaryMatch`, `layout.diagramStyle`,
 *   `layout.classicVariant`, `layout.classicFiveTeamSlots`, `layout.officialTemplateId` — i.e. any change
 *   that produces a new `layout` object, which is exactly when `buildBracketLayout` is re-run after a
 *   score is saved (see "recomputes ... when a real score flips a downstream feeder" below).
 * - Fields that must NOT invalidate it: every field of `BracketLiveGameStatus` (`scoreLabel`,
 *   `inningLabel`, `statusLabel`), because `resolveDoubleElimRenderSlots` never receives
 *   `liveGameStatuses` at all — it is looked up separately, per match id, only at render time for
 *   display labels (see "is invariant to simulated live-poll ticks" below).
 */

function baseSpec(over: Partial<BracketSpec> = {}): BracketSpec {
  return {
    version: 1,
    layoutPreference: "official",
    teams: [],
    games: [],
    rounds: [],
    flyer: { includeSponsors: false, sponsorLayout: "none", sponsorStrip: [] },
    ingestionWarnings: [],
    bracketFormat: "unknown",
    ...over,
  } as BracketSpec;
}

function matchIdForGame(spec: BracketSpec, gameNumber: string): string {
  for (const round of spec.rounds) {
    for (const match of round.matches) {
      if (match.officialGameNumber === gameNumber) return match.id;
    }
  }
  throw new Error(`missing game ${gameNumber}`);
}

function threeTeamSpec(championshipSeriesStyle: "winner_take_all" | "always_scheduled_reset") {
  const teams = ["Red", "Blue", "Green"];
  const rounds = buildRoundsFromOfficialTemplate("little_league_3_team_de", teams, {
    championshipSeriesStyle,
  });
  return baseSpec({
    ...specDefaultsFromOfficialTemplate("little_league_3_team_de", championshipSeriesStyle),
    teams,
    rounds,
    divisionLabel: "8U",
  });
}

describe("resolveDoubleElimRenderSlots", () => {
  it("recomputes classic three-team slots when a real score flips a downstream feeder", () => {
    let spec = threeTeamSpec("winner_take_all");
    const layoutBefore = buildBracketLayout(spec);
    assert.equal(layoutBefore.mode, "double_elimination");
    if (layoutBefore.mode !== "double_elimination") return;
    assert.equal(layoutBefore.classicVariant, "three_team");

    const slotsBefore = resolveDoubleElimRenderSlots(layoutBefore);
    // G2 (winnersSemi) hasn't been fed by G1's winner yet.
    assert.equal(slotsBefore.classicThreeSlots?.winnersSemi.away, "W1");

    // Win/loss flip: Blue beats Green in G1.
    spec = mergeMatchScoresIntoSpec(spec, {
      [matchIdForGame(spec, "1")]: { homeScore: 4, awayScore: 2, winnerSide: "home" },
    });
    const layoutAfter = buildBracketLayout(spec);
    assert.equal(layoutAfter.mode, "double_elimination");
    if (layoutAfter.mode !== "double_elimination") return;

    const slotsAfter = resolveDoubleElimRenderSlots(layoutAfter);
    assert.equal(slotsAfter.classicThreeSlots?.winnersSemi.away, "Blue");
  });

  it("re-injects the if-necessary game into resolved slots even though layout.championship filters it out", () => {
    let spec = threeTeamSpec("always_scheduled_reset");
    spec = mergeMatchScoresIntoSpec(spec, {
      [matchIdForGame(spec, "1")]: { homeScore: 4, awayScore: 2, winnerSide: "home" },
    });
    spec = mergeMatchScoresIntoSpec(spec, {
      [matchIdForGame(spec, "2")]: { homeScore: 3, awayScore: 5, winnerSide: "away" },
    });
    // Grand final (G4): losers-bracket side wins, forcing the if-necessary reset game (G5).
    spec = mergeMatchScoresIntoSpec(spec, {
      [matchIdForGame(spec, "4")]: { homeScore: 2, awayScore: 6, winnerSide: "away" },
    });

    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "double_elimination");
    if (layout.mode !== "double_elimination") return;

    // The if-necessary game is deliberately excluded from the rendered championship section...
    assert.deepEqual(
      layout.championship?.matches.map((m) => m.officialGameNumber),
      ["4"],
    );
    // ...but resolveDoubleElimRenderSlots must still surface it for the classic diagram.
    const slots = resolveDoubleElimRenderSlots(layout);
    assert.equal(slots.classicThreeSlots?.ifNecessary?.officialGameNumber, "5");
  });

  it("is deterministic for a stable layout reference, matching what useMemo([layout]) assumes", () => {
    const spec = threeTeamSpec("winner_take_all");
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "double_elimination");
    if (layout.mode !== "double_elimination") return;

    const first = resolveDoubleElimRenderSlots(layout);
    const second = resolveDoubleElimRenderSlots(layout);
    assert.deepEqual(first.classicThreeSlots, second.classicThreeSlots);
    assert.deepEqual([...first.allMatchesByGame.entries()], [...second.allMatchesByGame.entries()]);
  });

  it("is invariant to simulated live-poll ticks, because liveGameStatuses is never part of its input", () => {
    const spec = threeTeamSpec("winner_take_all");
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "double_elimination");
    if (layout.mode !== "double_elimination") return;

    const pollTicks: Record<string, BracketLiveGameStatus>[] = [
      {},
      { "official-winners-g1-x": { scoreLabel: "2-1", inningLabel: "Top 3rd", statusLabel: "Live" } },
      { "official-winners-g1-x": { scoreLabel: "5-1", inningLabel: "Final", statusLabel: "Final" } },
    ];

    const baseline = resolveDoubleElimRenderSlots(layout);
    for (const liveGameStatuses of pollTicks) {
      // `liveGameStatuses` intentionally isn't passed below: the component only ever threads it
      // into per-match display labels, never into slot resolution. Recomputing against the same
      // `layout` on every simulated poll tick must keep returning the same slots regardless of
      // what this tick's live statuses look like.
      void liveGameStatuses;
      const tick = resolveDoubleElimRenderSlots(layout);
      assert.deepEqual(tick.classicThreeSlots, baseline.classicThreeSlots);
    }
  });

  it("keeps the pre-resolved five-team slots from layout.classicFiveTeamSlots (locked official brackets)", () => {
    const teams = ["9U Westbank", "9U NORD", "9U St. Charles", "9U Eastbank", "9U Ascension"];
    const rounds = buildRoundsFromOfficialTemplate("little_league_5_team_de", teams, {
      championshipSeriesStyle: "winner_take_all",
    });
    const spec = baseSpec({
      ...specDefaultsFromOfficialTemplate("little_league_5_team_de", "winner_take_all"),
      teams,
      rounds,
      divisionLabel: "9U",
    });
    const layout = buildBracketLayout(spec);
    assert.equal(layout.mode, "double_elimination");
    if (layout.mode !== "double_elimination") return;
    assert.equal(layout.classicVariant, "five_team");
    assert.ok(layout.classicFiveTeamSlots);

    const slots = resolveDoubleElimRenderSlots(layout);
    assert.equal(slots.classicFiveSlots, layout.classicFiveTeamSlots);
  });
});
