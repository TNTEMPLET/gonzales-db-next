import assert from "node:assert/strict";
import test from "node:test";

import type { LayoutMatch } from "@/lib/tournament-brackets/bracketLayout";
import {
  buildLittleLeagueSixTeamModifiedDeRounds,
  buildLittleLeagueSixTeamStandardDeRounds,
} from "@/lib/tournament-brackets/ingestion/buildLittleLeagueSixTeamRounds";
import { resolveClassicSixTeamModifiedDeSlots } from "@/lib/tournament-brackets/classicSixTeamModifiedDeDiagram";

function match(game: string, home: string, away: string, role?: "grand_final" | "if_necessary"): LayoutMatch {
  return {
    id: `g${game}`,
    home,
    away,
    officialGameNumber: game,
    slotHome: home,
    slotAway: away,
    ...(role ? { championshipRole: role } : {}),
  };
}

function slotsFromRounds(rounds: ReturnType<typeof buildLittleLeagueSixTeamStandardDeRounds>) {
  const map = new Map<string, LayoutMatch>();
  for (const m of rounds.flatMap((r) => r.matches)) {
    const g = m.officialGameNumber?.trim();
    if (!g) continue;
    map.set(g, {
      id: m.id,
      home: m.home,
      away: m.away,
      officialGameNumber: g,
      slotHome: m.home,
      slotAway: m.away,
      championshipRole: m.championshipRole,
    });
  }
  return map;
}

test("resolveClassicSixTeamModifiedDeSlots maps standard G1–G11 Little League tree", () => {
  const rounds = buildLittleLeagueSixTeamStandardDeRounds(["A", "B", "C", "D", "E", "F"]);
  const slots = resolveClassicSixTeamModifiedDeSlots(slotsFromRounds(rounds));
  assert.ok(slots);
  assert.equal(slots!.openers[0]!.home, "A");
  assert.equal(slots!.openers[0]!.away, "B");
  assert.equal(slots!.openers[1]!.home, "C");
  assert.equal(slots!.openers[1]!.away, "D");
  assert.equal(slots!.winnersSemis[0]!.home, "W1");
  assert.equal(slots!.winnersSemis[0]!.away, "E");
  assert.equal(slots!.winnersSemis[1]!.home, "W2");
  assert.equal(slots!.winnersSemis[1]!.away, "F");
  assert.equal(slots!.winnersFinal.officialGameNumber, "7");
  assert.equal(slots!.grandFinal.officialGameNumber, "10");
  assert.equal(slots!.ifNecessary?.officialGameNumber, "11");
});

test("resolveClassicSixTeamModifiedDeSlots maps modified G1–G10 without if-necessary", () => {
  const rounds = buildLittleLeagueSixTeamModifiedDeRounds(["A", "B", "C", "D", "E", "F"]);
  const slots = resolveClassicSixTeamModifiedDeSlots(slotsFromRounds(rounds));
  assert.ok(slots);
  assert.equal(slots!.grandFinal.officialGameNumber, "10");
  assert.equal(slots!.ifNecessary, undefined);
});

test("resolveClassicSixTeamModifiedDeSlots rejects 5-team classic trees", () => {
  const map = new Map<string, LayoutMatch>([
    ["1", match("1", "A", "B")],
    ["2", match("2", "C", "D")],
    ["3", match("3", "W1", "E")],
    ["4", match("4", "W3", "W2")],
    ["5", match("5", "L1", "L2")],
    ["6", match("6", "W5", "L3")],
    ["7", match("7", "L4", "W6")],
    ["8", match("8", "W4", "W7", "grand_final")],
  ]);
  assert.equal(resolveClassicSixTeamModifiedDeSlots(map), null);
});
