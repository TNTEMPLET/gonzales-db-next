import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLASSIC_6TEAM_DE_LANE_ROWS,
  classicSixTeamModifiedDeGridSlots,
} from "@/lib/tournament-brackets/classicSixTeamModifiedDeGridPlacement";

describe("classicSixTeamModifiedDeGridPlacement", () => {
  it("stacks G6 below G5, flows W5/W6 → G8 → G9 → G10 without winner-drop lines", () => {
    const p = classicSixTeamModifiedDeGridSlots();

    assert.equal(CLASSIC_6TEAM_DE_LANE_ROWS, 9);

    assert.deepEqual({ col: p.g5.col, row: p.g5.row }, { col: 1, row: 6 });
    assert.deepEqual({ col: p.g6.col, row: p.g6.row }, { col: 1, row: 7 });
    assert.deepEqual({ col: p.g8.col, row: p.g8.row, span: p.g8.span }, { col: 3, row: 6, span: 2 });
    assert.deepEqual({ col: p.g9.col, row: p.g9.row, span: p.g9.span }, { col: 5, row: 6, span: 2 });
    assert.deepEqual({ col: p.g10.col, row: p.g10.row, span: p.g10.span }, { col: 7, row: 2, span: 6 });
    assert.deepEqual({ col: p.g11.col, row: p.g11.row }, { col: 7, row: 8 });

    assert.ok(!("connG5G6" in p));
    assert.ok(!("connDropG1G5" in p));
    assert.ok(!("connDropG7G9" in p));

    assert.deepEqual(
      { col: p.connLosersG8.col, row: p.connLosersG8.row, span: p.connLosersG8.span },
      { col: 2, row: 6, span: 2 },
    );
    assert.deepEqual(
      { col: p.connFinalsG10.col, row: p.connFinalsG10.row, span: p.connFinalsG10.span },
      { col: 6, row: 2, span: 7 },
    );
    assert.deepEqual(
      { col: p.connG8G9.col, row: p.connG8G9.row, span: p.connG8G9.span },
      { col: 4, row: 6, span: 2 },
    );
    assert.deepEqual(
      { col: p.tournamentInfo.col, row: p.tournamentInfo.row, colSpan: p.tournamentInfo.colSpan },
      { col: 5, row: 1, colSpan: 3 },
    );
  });
});
