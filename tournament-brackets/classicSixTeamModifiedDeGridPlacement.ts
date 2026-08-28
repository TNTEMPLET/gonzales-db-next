import type { ClassicGridPlacement } from "@/lib/tournament-brackets/classicDoubleElimGridPlacement";

/** 9 lanes: top pad + 2 opener rows + band gap + 3 losers bands. */
export const CLASSIC_6TEAM_DE_LANE_ROWS = 9;

export type ClassicSixTeamModifiedDeGridSlots = {
  winnersTopPad: ClassicGridPlacement;
  tournamentInfo: ClassicGridPlacement;
  g1: ClassicGridPlacement;
  g2: ClassicGridPlacement;
  g3: ClassicGridPlacement;
  g4: ClassicGridPlacement;
  g7: ClassicGridPlacement;
  bandGap: ClassicGridPlacement;
  g5: ClassicGridPlacement;
  g6: ClassicGridPlacement;
  g8: ClassicGridPlacement;
  g9: ClassicGridPlacement;
  g10: ClassicGridPlacement;
  g11: ClassicGridPlacement;
  connG1G3: ClassicGridPlacement;
  connG2G4: ClassicGridPlacement;
  connWinnersG7: ClassicGridPlacement;
  connLosersG8: ClassicGridPlacement;
  connG8G9: ClassicGridPlacement;
  connFinalsG10: ClassicGridPlacement;
  connG10Champion: ClassicGridPlacement;
  champion: ClassicGridPlacement;
};

const ROWS = {
  topPad: 1,
  wOp1: 2,
  wOp2: 3,
  bandGapTop: 4,
  bandGapBot: 5,
  lR1: 6,
  lR2: 7,
  lR3: 8,
  lFinal: 9,
} as const;

/**
 * Classic 6-team DE on the 8-slot power-of-2 shell.
 * Losers round 1 stacks G6 below G5; W5/W6 → G8 → G9 → G10. No winner-drop lines except G7→G10 finals.
 */
export function classicSixTeamModifiedDeGridSlots(): ClassicSixTeamModifiedDeGridSlots {
  const { topPad, wOp1, wOp2, bandGapTop, bandGapBot, lR1, lR2, lR3, lFinal } = ROWS;
  const openerPairSpan = wOp2 - wOp1 + 1;
  const bandGapSpan = bandGapBot - bandGapTop + 1;
  const losersRound1Span = lR2 - lR1 + 1;
  const finalsRow = wOp1;
  const finalsSpan = lFinal - wOp1 + 1;

  return {
    winnersTopPad: { col: 1, row: topPad, span: 1 },
    tournamentInfo: { col: 5, row: topPad, span: 1, colSpan: 3 },
    g1: { col: 1, row: wOp1, span: 1 },
    g2: { col: 1, row: wOp2, span: 1 },
    g3: { col: 3, row: wOp1, span: 1 },
    g4: { col: 3, row: wOp2, span: 1 },
    g7: { col: 5, row: wOp1, span: openerPairSpan },
    bandGap: { col: 1, row: bandGapTop, span: bandGapSpan, colSpan: 7 },
    g5: { col: 1, row: lR1, span: 1 },
    g6: { col: 1, row: lR2, span: 1 },
    g8: { col: 3, row: lR1, span: losersRound1Span },
    g9: { col: 5, row: lR1, span: losersRound1Span },
    g10: { col: 7, row: finalsRow, span: finalsSpan },
    g11: { col: 7, row: lR3, span: 1 },
    connG1G3: { col: 2, row: wOp1, span: 1 },
    connG2G4: { col: 2, row: wOp2, span: 1 },
    connWinnersG7: { col: 4, row: wOp1, span: openerPairSpan },
    connLosersG8: { col: 2, row: lR1, span: losersRound1Span },
    connG8G9: { col: 4, row: lR1, span: losersRound1Span },
    connFinalsG10: { col: 6, row: finalsRow, span: finalsSpan },
    connG10Champion: { col: 8, row: finalsRow, span: finalsSpan },
    /** Same row band as G10 so the plaque shares G10's vertical center (measured in diagram). */
    champion: { col: 9, row: finalsRow, span: finalsSpan },
  };
}
