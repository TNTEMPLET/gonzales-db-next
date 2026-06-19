import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LayoutMatch } from "@/lib/tournament-brackets/bracketLayout";
import {
  canUseClassicUnifiedDoubleElimDiagram,
  resolveClassicDoubleElimSlots,
} from "@/lib/tournament-brackets/classicDoubleElimDiagram";

function match(game: string, home: string, away: string): LayoutMatch {
  return {
    id: `g${game}`,
    home,
    away,
    officialGameNumber: game,
    slotHome: home,
    slotAway: away,
  };
}

describe("classicDoubleElimDiagram", () => {
  it("detects compact 5-team DE game numbering", () => {
    const map = new Map<string, LayoutMatch>([
      ["1", match("1", "A", "B")],
      ["2", match("2", "C", "D")],
      ["8", match("8", "W4", "W6")],
    ]);
    assert.equal(canUseClassicUnifiedDoubleElimDiagram(map), true);
  });

  it("rejects brackets with more than 12 live games", () => {
    const map = new Map<string, LayoutMatch>();
    for (let i = 1; i <= 13; i++) {
      map.set(String(i), match(String(i), "A", "B"));
    }
    assert.equal(canUseClassicUnifiedDoubleElimDiagram(map), false);
  });

  it("maps G1–G7 and G8–G9 into classic slots", () => {
    const map = new Map<string, LayoutMatch>([
      ["1", match("1", "Ponchatoula", "Loranger")],
      ["2", match("2", "Kentwood", "Franklinton")],
      ["3", match("3", "W1", "Gonzales")],
      ["4", match("4", "L1", "L2")],
      ["5", match("5", "W3", "W2")],
      ["6", match("6", "W4", "L3")],
      ["7", match("7", "L4", "W6")],
      ["8", match("8", "W5", "W7")],
      ["9", match("9", "W8", "L8")],
    ]);
    const slots = resolveClassicDoubleElimSlots(map);
    assert.ok(slots);
    assert.equal(slots!.openers[0]!.home, "Ponchatoula");
    assert.equal(slots!.winnersFinal.away, "W2");
    assert.equal(slots!.losersRound1.home, "L1");
    assert.equal(slots!.losersCrossover!.home, "W4");
    assert.equal(slots!.losersFinal.home, "L4");
    assert.equal(slots!.losersFinal.away, "W6");
    assert.equal(slots!.grandFinal!.home, "W5");
    assert.equal(slots!.ifNecessary?.officialGameNumber, "9");
  });

  it("resolves without G9 when if-necessary game is absent", () => {
    const map = new Map<string, LayoutMatch>([
      ["1", match("1", "A", "B")],
      ["2", match("2", "C", "D")],
      ["3", match("3", "W1", "E")],
      ["4", match("4", "L1", "L2")],
      ["5", match("5", "W3", "W2")],
      ["6", match("6", "W4", "L3")],
      ["7", match("7", "L4", "W6")],
      ["8", match("8", "W5", "W7")],
    ]);
    const slots = resolveClassicDoubleElimSlots(map);
    assert.ok(slots);
    assert.equal(slots!.ifNecessary, null);
  });

  it("maps District 6 10U three-game championship series into classic pre-series slots", () => {
    const map = new Map<string, LayoutMatch>([
      ["1", match("1", "Ponchatoula", "Loranger")],
      ["2", match("2", "Kentwood", "Franklinton")],
      ["3", match("3", "Loranger", "Gonzales")],
      ["4", match("4", "Ponchatoula", "Kentwood")],
      ["5", match("5", "W4", "L3")],
      ["6", match("6", "W3", "Franklinton")],
      ["7", match("7", "W6", "W5")],
      ["8", match("8", "W6", "W5")],
      ["9", match("9", "W6", "W5")],
    ]);
    const slots = resolveClassicDoubleElimSlots(map);
    assert.ok(slots);
    assert.equal(slots!.winnersFinal.officialGameNumber, "6");
    assert.equal(slots!.losersRound1.officialGameNumber, "4");
    assert.equal(slots!.losersCrossover, null);
    assert.equal(slots!.losersFinal.officialGameNumber, "5");
    assert.equal(slots!.grandFinal, null);
    assert.deepEqual(
      slots!.championshipSeries?.map((m) => m.officialGameNumber),
      ["7", "8", "9"],
    );
  });

  it("returns null when a required game is missing", () => {
    const map = new Map<string, LayoutMatch>([["1", match("1", "A", "B")]]);
    assert.equal(resolveClassicDoubleElimSlots(map), null);
  });

  it("rejects 6-team Little League G1–G11 trees (championship on G11, three openers)", () => {
    const map = new Map<string, LayoutMatch>([
      ["1", match("1", "A", "B")],
      ["2", match("2", "C", "D")],
      ["3", match("3", "E", "F")],
      ["4", match("4", "W1", "W2")],
      ["5", match("5", "L1", "L4")],
      ["6", match("6", "L2", "L3")],
      ["7", match("7", "W3", "W4")],
      ["8", match("8", "W5", "W6")],
      ["9", match("9", "L7", "W8")],
      ["10", match("10", "W7", "W9")],
      [
        "11",
        {
          ...match("11", "W10", "L10"),
          championshipRole: "grand_final" as const,
        },
      ],
    ]);
    assert.equal(resolveClassicDoubleElimSlots(map), null);
  });
});
