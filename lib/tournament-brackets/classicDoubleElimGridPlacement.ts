/** Connected-grid lane geometry for the 5-team classic double-elimination diagram. */

/**
 * LOCKED — District 6 10U classic diagram geometry (approved 2026-06).
 * Do not change row bands, band-gap rows, or G8 placement without a visual bracket review.
 * G8 vertical position is measured at runtime in ClassicDoubleElimDiagram (G4/G7 midpoint).
 */

/** 9 lanes: top pad + winners band + gap + band gap + losers band. */
export const CLASSIC_DE_LANE_ROWS = 9;

export type ClassicGridPlacement = {
  col: number;
  row: number;
  span: number;
  colSpan?: number;
};

export type ClassicDoubleElimGridSlots = {
  winnersTopPad: ClassicGridPlacement;
  g1: ClassicGridPlacement;
  winnersR1Bot: ClassicGridPlacement;
  g2: ClassicGridPlacement;
  g3: ClassicGridPlacement;
  g4: ClassicGridPlacement;
  bandGap: ClassicGridPlacement;
  g5: ClassicGridPlacement;
  g6: ClassicGridPlacement;
  g7: ClassicGridPlacement;
  g8: ClassicGridPlacement;
  /** Standard DE only: if-necessary game below G8 (same column, losers row). */
  g9: ClassicGridPlacement;
  connG1G3: ClassicGridPlacement;
  connWinnersG4: ClassicGridPlacement;
  connG5G6: ClassicGridPlacement;
  connG6G7: ClassicGridPlacement;
  connFinalsG8: ClassicGridPlacement;
  /** Standard DE only: gutter + champion column to the right of G8 (cols 8–9). */
  connG8Champion: ClassicGridPlacement;
  champion: ClassicGridPlacement;
};

/** Row bands for the classic 9-lane grid. */
export const CLASSIC_DE_ROWS = {
  topPad: 1,
  wR1Top: 2,
  wR1Mid: 3,
  wR1Bot: 4,
  winnersEnd: 5,
  gap: 6,
  bandGapTop: 7,
  bandGapBot: 8,
  losers: 9,
} as const;

/**
 * Classic 5-team DE layout:
 * - G1 play-in spans same rows as G3 (horizontal alignment)
 * - G2 under G3; G4 centered between G3 and G2
 * - Extra band-gap rows separate winners from losers for G8 centering
 * - Single finals connector G4 + G7 → G8
 */
export function classicDoubleElimGridSlots(): ClassicDoubleElimGridSlots {
  const { topPad, wR1Top, wR1Mid, wR1Bot, winnersEnd, bandGapTop, bandGapBot, losers } =
    CLASSIC_DE_ROWS;
  const winnersPairSpan = wR1Mid - wR1Top + 1;
  /** Rows covered by G3 (top) through G2 (bottom) — G4 centers on this band. */
  const winnersFeederSpan = wR1Bot - wR1Top + 1;
  const bandGapSpan = bandGapBot - bandGapTop + 1;
  /** Full winners→losers band; vertical position is measured in the diagram. */
  const finalsRow = wR1Top;
  const finalsSpan = losers - wR1Top + 1;

  return {
    winnersTopPad: { col: 1, row: topPad, span: 1 },
    g1: { col: 1, row: wR1Top, span: winnersPairSpan },
    winnersR1Bot: { col: 1, row: wR1Bot, span: 1 },
    g3: { col: 3, row: wR1Top, span: winnersPairSpan },
    g2: { col: 3, row: wR1Bot, span: 1 },
    g4: { col: 5, row: wR1Top, span: winnersFeederSpan },
    bandGap: { col: 1, row: bandGapTop, span: bandGapSpan, colSpan: 7 },
    g5: { col: 1, row: losers, span: 1 },
    g6: { col: 3, row: losers, span: 1 },
    g7: { col: 5, row: losers, span: 1 },
    g8: { col: 7, row: finalsRow, span: finalsSpan },
    g9: { col: 7, row: losers, span: 1 },
    connG1G3: { col: 2, row: wR1Top, span: winnersPairSpan },
    connWinnersG4: { col: 4, row: wR1Top, span: winnersFeederSpan },
    connG5G6: { col: 2, row: losers, span: 1 },
    connG6G7: { col: 4, row: losers, span: 1 },
    connFinalsG8: { col: 6, row: wR1Mid, span: losers - wR1Mid + 1 },
    connG8Champion: { col: 8, row: finalsRow, span: finalsSpan },
    champion: { col: 9, row: finalsRow, span: finalsSpan },
  };
}
