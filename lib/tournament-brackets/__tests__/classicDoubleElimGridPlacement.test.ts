import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLASSIC_DE_LANE_ROWS,
  CLASSIC_DE_ROWS,
  classicDoubleElimGridSlots,
} from "@/lib/tournament-brackets/classicDoubleElimGridPlacement";

/** Approved District 6 10U layout — update only with visual bracket review. */
const LOCKED = {
  laneRows: 9,
  losersRow: 9,
  g9Col: 7,
  bandGapRows: [7, 8] as const,
  g8Col: 7,
  connFinalsCol: 6,
  connG8ChampionCol: 8,
  championCol: 9,
} as const;

describe("classicDoubleElimGridPlacement", () => {
  it("aligns G1 with G3, centers G4 on G3/G2, single finals connector", () => {
    const p = classicDoubleElimGridSlots();
    assert.equal(p.g1.span, 2);
    assert.equal(p.g3.span, 2);
    assert.equal(p.g1.row, p.g3.row);
    assert.equal(p.g4.row, CLASSIC_DE_ROWS.wR1Top);
    assert.equal(p.g4.span, CLASSIC_DE_ROWS.wR1Bot - CLASSIC_DE_ROWS.wR1Top + 1);
    assert.equal(p.g2.row, CLASSIC_DE_ROWS.wR1Bot);
    assert.equal(p.g5.row, CLASSIC_DE_ROWS.losers);
    assert.equal(p.bandGap.row, CLASSIC_DE_ROWS.bandGapTop);
    assert.equal(p.bandGap.span, CLASSIC_DE_ROWS.bandGapBot - CLASSIC_DE_ROWS.bandGapTop + 1);
    assert.equal(p.g8.row, CLASSIC_DE_ROWS.wR1Top);
    assert.equal(p.g8.span, CLASSIC_DE_ROWS.losers - CLASSIC_DE_ROWS.wR1Top + 1);
    assert.equal(p.connFinalsG8.span, CLASSIC_DE_ROWS.losers - CLASSIC_DE_ROWS.wR1Mid + 1);
    assert.ok(!("connG4G8" in p));
  });

  it("locks approved District 6 10U column and band-gap geometry", () => {
    assert.equal(CLASSIC_DE_LANE_ROWS, LOCKED.laneRows);
    assert.equal(CLASSIC_DE_ROWS.losers, LOCKED.losersRow);
    assert.equal(CLASSIC_DE_ROWS.bandGapTop, LOCKED.bandGapRows[0]);
    assert.equal(CLASSIC_DE_ROWS.bandGapBot, LOCKED.bandGapRows[1]);

    const p = classicDoubleElimGridSlots();

    assert.deepEqual(
      { col: p.g1.col, row: p.g1.row, span: p.g1.span },
      { col: 1, row: 2, span: 2 },
    );
    assert.deepEqual(
      { col: p.g2.col, row: p.g2.row, span: p.g2.span },
      { col: 3, row: 4, span: 1 },
    );
    assert.deepEqual(
      { col: p.g3.col, row: p.g3.row, span: p.g3.span },
      { col: 3, row: 2, span: 2 },
    );
    assert.deepEqual(
      { col: p.g4.col, row: p.g4.row, span: p.g4.span },
      { col: 5, row: 2, span: 3 },
    );
    assert.deepEqual(
      { col: p.bandGap.col, row: p.bandGap.row, span: p.bandGap.span, colSpan: p.bandGap.colSpan },
      { col: 1, row: 7, span: 2, colSpan: 7 },
    );
    assert.deepEqual(
      { col: p.g5.col, row: p.g5.row },
      { col: 1, row: 9 },
    );
    assert.deepEqual(
      { col: p.g6.col, row: p.g6.row },
      { col: 3, row: 9 },
    );
    assert.deepEqual(
      { col: p.g7.col, row: p.g7.row },
      { col: 5, row: 9 },
    );
    assert.deepEqual(
      { col: p.g8.col, row: p.g8.row, span: p.g8.span },
      { col: LOCKED.g8Col, row: 2, span: 8 },
    );
    assert.deepEqual(
      { col: p.g9.col, row: p.g9.row, span: p.g9.span },
      { col: LOCKED.g8Col, row: LOCKED.losersRow, span: 1 },
    );
    assert.deepEqual(
      { col: p.connFinalsG8.col, row: p.connFinalsG8.row, span: p.connFinalsG8.span },
      { col: LOCKED.connFinalsCol, row: 3, span: 7 },
    );
    assert.equal(p.connWinnersG4.col, 4);
    assert.ok(!("connG4G8" in p));
    assert.ok(!("connG7G8" in p));
    assert.deepEqual(
      { col: p.connG8Champion.col, row: p.connG8Champion.row, span: p.connG8Champion.span },
      { col: LOCKED.connG8ChampionCol, row: 2, span: 8 },
    );
    assert.deepEqual(
      { col: p.champion.col, row: p.champion.row, span: p.champion.span },
      { col: LOCKED.championCol, row: 2, span: 8 },
    );
  });
});
