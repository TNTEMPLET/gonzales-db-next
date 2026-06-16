import { BYE_SLOT_LABEL } from "@/lib/tournament-brackets/generateSingleElimFromTeams";
import { classicFiveTeamParticipantSlots } from "@/lib/tournament-brackets/doubleEliminationClassicLayoutTemplate";

/**
 * Little League printable PDF slot layouts on the smallest power-of-two shell.
 * Teams are placeholder order A–F (or real names in the same seed order).
 */

/** Winners R2 pairings for 8-slot shells with two R1 games + two bye teams (5-team and 6-team LL). */
export const LITTLE_LEAGUE_EIGHT_SLOT_WINNERS_R2_PAIRINGS: number[][][] = [
  [[0, 2], [1, 3]],
];

/**
 * 6-team LL on 8-slot shell (matches printable bracket):
 * - G1: A vs B  (slots 0 vs 7)
 * - G2: C vs D  (slots 3 vs 4)
 * - E, F byes   (slots 1, 2 vs BYE)
 * - G3: W1 vs E, G4: W2 vs F
 */
export function littleLeagueSixTeamParticipantSlots(teams: string[]): string[] {
  const t = teams.map((s) => s.trim()).filter(Boolean);
  if (t.length !== 6) {
    throw new Error(`Little League 6-team shell requires exactly 6 teams (got ${t.length}).`);
  }
  return [
    t[0]!, // A
    t[4]!, // E (bye)
    t[5]!, // F (bye)
    t[2]!, // C
    t[3]!, // D
    BYE_SLOT_LABEL,
    BYE_SLOT_LABEL,
    t[1]!, // B
  ];
}

export function isLittleLeagueSixTeamShellStructure(slots: string[]): boolean {
  if (slots.length !== 8) return false;
  return (
    slots[5] === BYE_SLOT_LABEL &&
    slots[6] === BYE_SLOT_LABEL &&
    slots[0] !== BYE_SLOT_LABEL &&
    slots[1] !== BYE_SLOT_LABEL &&
    slots[2] !== BYE_SLOT_LABEL &&
    slots[3] !== BYE_SLOT_LABEL &&
    slots[4] !== BYE_SLOT_LABEL &&
    slots[7] !== BYE_SLOT_LABEL
  );
}

export function littleLeagueFiveTeamParticipantSlots(teams: string[]): string[] {
  return classicFiveTeamParticipantSlots(teams);
}

export function resolveLittleLeagueParticipantSlots(
  teamCount: number,
  teams: string[],
): string[] | undefined {
  if (teamCount === 5) return littleLeagueFiveTeamParticipantSlots(teams);
  if (teamCount === 6) return littleLeagueSixTeamParticipantSlots(teams);
  return undefined;
}
