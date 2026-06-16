import type { LayoutMatch } from "@/lib/tournament-brackets/bracketLayout";
import { isFeederSlotLabel } from "@/lib/tournament-brackets/classicDoubleElimDiagram";

export type ClassicSixTeamModifiedDeSlots = {
  openers: [LayoutMatch, LayoutMatch];
  winnersSemis: [LayoutMatch, LayoutMatch];
  winnersFinal: LayoutMatch;
  losersRound1: [LayoutMatch, LayoutMatch];
  losersRound2: LayoutMatch;
  losersCrossover: LayoutMatch;
  grandFinal: LayoutMatch;
  ifNecessary?: LayoutMatch;
};

/**
 * Maps G1–G11 Little League 6-team double-elimination into classic diagram slots.
 * Winners use the 8-slot power-of-2 shell: G1/G2 openers, G3/G4 bye semis, G7 final.
 */
export function resolveClassicSixTeamModifiedDeSlots(
  matchesByGame: Map<string, LayoutMatch>,
): ClassicSixTeamModifiedDeSlots | null {
  const g1 = matchesByGame.get("1");
  const g2 = matchesByGame.get("2");
  const g3 = matchesByGame.get("3");
  const g4 = matchesByGame.get("4");
  const g5 = matchesByGame.get("5");
  const g6 = matchesByGame.get("6");
  const g7 = matchesByGame.get("7");
  const g8 = matchesByGame.get("8");
  const g9 = matchesByGame.get("9");
  const g10 = matchesByGame.get("10");
  const g11 = matchesByGame.get("11");

  if (!g1 || !g2 || !g3 || !g4 || !g5 || !g6 || !g7 || !g8 || !g9 || !g10) return null;

  const grandFinal =
    g10.championshipRole === "grand_final"
      ? g10
      : [...matchesByGame.values()].find((m) => m.championshipRole === "grand_final");
  if (!grandFinal || grandFinal.officialGameNumber?.trim() !== "10") return null;

  for (const opener of [g1, g2]) {
    if (isFeederSlotLabel(opener.home) || isFeederSlotLabel(opener.away)) return null;
  }

  // G3/G4 are bye semis (feeder vs team), not a third opener.
  for (const semi of [g3, g4]) {
    const homeFeeder = isFeederSlotLabel(semi.home);
    const awayFeeder = isFeederSlotLabel(semi.away);
    if (homeFeeder === awayFeeder) return null;
  }

  if (!isFeederSlotLabel(g7.home) || !isFeederSlotLabel(g7.away)) return null;
  if (!isFeederSlotLabel(g10.home) || !isFeederSlotLabel(g10.away)) return null;

  const ifNecessary =
    g11?.championshipRole === "if_necessary" && g11.officialGameNumber?.trim() === "11" ? g11 : undefined;

  return {
    openers: [g1, g2],
    winnersSemis: [g3, g4],
    winnersFinal: g7,
    losersRound1: [g5, g6],
    losersRound2: g8,
    losersCrossover: g9,
    grandFinal: g10,
    ...(ifNecessary ? { ifNecessary } : {}),
  };
}

export function canUseClassicSixTeamModifiedDeDiagram(
  matchesByGame: Map<string, LayoutMatch>,
): boolean {
  return resolveClassicSixTeamModifiedDeSlots(matchesByGame) !== null;
}
