import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import { matchGridPlacement, podiumColumnGridPlacement } from "@/lib/tournament-brackets/bracketGridPlacement";
import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";

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
    bracketFormat: "single_elimination",
    treeLayout: "connected",
    ...over,
  };
}

describe("matchGridPlacement", () => {
  it("places compact six-team semis on the same rows as their first-round feeders", () => {
    const layout = buildBracketLayout(
      baseSpec({
        teams: ["A", "B", "C", "D", "E", "F"],
        bracketFormat: "single_elimination",
      }),
    );
    assert.equal(layout.mode, "tree");
    if (layout.mode !== "tree") return;

    const rounds = layout.rounds;
    const N = layout.connectedLaneRowCount ?? 0;
    assert.equal(N, 4);

    const r0slot1 = matchGridPlacement(rounds, 0, 1, N, true);
    assert.deepEqual(r0slot1, { rowStart: 3, span: 1 });

    const r0slot3 = matchGridPlacement(rounds, 0, 3, N, true);
    assert.deepEqual(r0slot3, { rowStart: 5, span: 1 });

    const r1slot0 = matchGridPlacement(rounds, 1, 0, N, true);
    assert.deepEqual(r1slot0, { rowStart: 3, span: 1 });

    const r1slot1 = matchGridPlacement(rounds, 1, 1, N, true);
    assert.deepEqual(r1slot1, { rowStart: 5, span: 1 });

    const finalRoundIndex = rounds.length - 1;
    const rFinal = matchGridPlacement(rounds, finalRoundIndex, 0, N, true);
    assert.deepEqual(rFinal, { rowStart: 2, span: 4 });
    assert.deepEqual(podiumColumnGridPlacement(N, true), { rowStart: 2, span: 4 });
  });

  it("keeps default two-row spans for non-compact brackets", () => {
    const layout = buildBracketLayout(
      baseSpec({
        teams: ["A", "B", "C", "D", "E", "F", "G", "H"],
        bracketFormat: "single_elimination",
      }),
    );
    assert.equal(layout.mode, "tree");
    if (layout.mode !== "tree") return;

    const rounds = layout.rounds;
    const N = layout.connectedLaneRowCount ?? 0;
    assert.equal(N, 4);

    assert.deepEqual(matchGridPlacement(rounds, 1, 0, N, false), { rowStart: 2, span: 2 });
    assert.deepEqual(matchGridPlacement(rounds, 1, 1, N, false), { rowStart: 4, span: 2 });
  });
});
