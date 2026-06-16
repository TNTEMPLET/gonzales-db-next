import type { LayoutMatch } from "@/lib/tournament-brackets/bracketLayout";
import { BYE_SLOT_LABEL } from "@/lib/tournament-brackets/generateSingleElimFromTeams";

/** Live games for a padded 5–7 team 8-slot double-elimination bracket (≤12 games). */
export function canUseClassicUnifiedDoubleElimDiagram(
  matchesByGame: Map<string, LayoutMatch>,
): boolean {
  if (!matchesByGame.has("1") || !matchesByGame.has("2")) return false;
  const nums = [...matchesByGame.keys()]
    .map((g) => Number.parseInt(g, 10))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return false;
  const max = Math.max(...nums);
  return max <= 12;
}

export type ClassicDoubleElimSlots = {
  openers: [LayoutMatch, LayoutMatch];
  winnersSemi: LayoutMatch;
  winnersFinal: LayoutMatch;
  losersRound1: LayoutMatch;
  losersCrossover: LayoutMatch;
  losersFinal: LayoutMatch;
  grandFinal: LayoutMatch;
  ifNecessary?: LayoutMatch | null;
};

export function isFeederSlotLabel(label: string): boolean {
  const t = label.trim();
  return /^[WL]\d+$/.test(t) || t === BYE_SLOT_LABEL || t === "TBD";
}

/**
 * Maps live game numbers from a sparse 8-slot DE bracket into classic diagram slots.
 * Expected: G1/G2 openers, G3 semi, G4 winners final, G5–G7 losers, G8 grand final.
 * G9 (if necessary) is shown below G8 on the classic diagram for standard double elimination.
 *
 * Rejects 6-team Little League trees (three openers, championship on G11, live G10).
 */
export function resolveClassicDoubleElimSlots(
  matchesByGame: Map<string, LayoutMatch>,
): ClassicDoubleElimSlots | null {
  const g1 = matchesByGame.get("1");
  const g2 = matchesByGame.get("2");
  const g3 = matchesByGame.get("3");
  const g4 = matchesByGame.get("4");
  const g5 = matchesByGame.get("5");
  const g6 = matchesByGame.get("6");
  const g7 = matchesByGame.get("7");
  const g8 = matchesByGame.get("8");

  if (!g1 || !g2 || !g3 || !g4 || !g5 || !g6 || !g7 || !g8) return null;

  const grandFinalByRole = [...matchesByGame.values()].find(
    (m) => m.championshipRole === "grand_final",
  );
  const grandFinalGame = grandFinalByRole?.officialGameNumber?.trim();
  if (grandFinalGame && grandFinalGame !== "8") return null;

  // 6-team modified DE uses G10–G11; classic 5-team stops at G9 (if necessary).
  if (matchesByGame.has("10")) {
    const g10 = matchesByGame.get("10");
    if (!g10 || g10.championshipRole !== "if_necessary") return null;
  }
  if (matchesByGame.has("11")) return null;

  // Classic 5-team: G3 is a semi (feeder vs team). 6-team: G3 is a third opener (E vs F).
  if (!isFeederSlotLabel(g3.home) && !isFeederSlotLabel(g3.away)) return null;

  return {
    openers: [g1, g2],
    winnersSemi: g3,
    winnersFinal: g4,
    losersRound1: g5,
    losersCrossover: g6,
    losersFinal: g7,
    grandFinal: g8,
    ifNecessary: matchesByGame.get("9") ?? null,
  };
}

export function isRenderableClassicMatch(m: LayoutMatch): boolean {
  const h = m.home.trim();
  const a = m.away.trim();
  if (h === BYE_SLOT_LABEL && a === BYE_SLOT_LABEL) return false;
  if (h === "TBD" && a === "TBD") return false;
  return true;
}
