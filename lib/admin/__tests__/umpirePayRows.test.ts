import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fallBallAssignmentPay, fallBallPayBand } from "../fallBallUmpirePay";
import {
  buildMainReportRows,
  buildUmpireReportRows,
  gameUsesUmpires,
} from "../umpirePayRows";
import type { Game } from "@/lib/fetchGames";

const FALL_BALL = { org: "fallball" } as const;

describe("gameUsesUmpires", () => {
  it("drops tee ball and 6U modified, including Assignr labels", () => {
    assert.equal(gameUsesUmpires("4U TB"), false);
    assert.equal(gameUsesUmpires("5U TB"), false);
    assert.equal(gameUsesUmpires("6U MOD"), false);
    assert.equal(gameUsesUmpires("6u mod"), false);
    assert.equal(gameUsesUmpires("Tee Ball, 3-4 year-olds"), false);
    assert.equal(gameUsesUmpires("Tee Ball, 5 year-olds"), false);
    assert.equal(gameUsesUmpires("Modified Tee Ball, 6 year-olds"), false);
  });

  it("keeps 6U LLB and 7U CP and older, including unstaffed games", () => {
    assert.equal(gameUsesUmpires("6U LLB"), true);
    assert.equal(gameUsesUmpires("6U DYB"), true);
    assert.equal(gameUsesUmpires("7U CP"), true);
    assert.equal(gameUsesUmpires("8U CP"), true);
    assert.equal(gameUsesUmpires("9U"), true);
    assert.equal(gameUsesUmpires("10U LLB"), true);
    assert.equal(gameUsesUmpires("Unassigned"), true);
  });
});

describe("Fall Ball 7/30/2026 pay sheet", () => {
  it("maps divisions onto the sheet bands", () => {
    assert.equal(fallBallPayBand("4U TB"), "tee");
    assert.equal(fallBallPayBand("6U MOD"), "tee");
    assert.equal(fallBallPayBand("7U CP"), "coach");
    assert.equal(fallBallPayBand("8U CP"), "coach");
    assert.equal(fallBallPayBand("9U"), "nineTwelve");
    assert.equal(fallBallPayBand("10U"), "nineTwelve");
    assert.equal(fallBallPayBand("12U"), "nineTwelve");
    assert.equal(fallBallPayBand("15U"), "thirteenFourteen");
    assert.equal(fallBallPayBand("13-14"), "thirteenFourteen");
    assert.equal(fallBallPayBand("13-15 year-olds"), "thirteenFourteen");
    assert.equal(fallBallPayBand("17U"), "fifteenSeventeen");
    assert.equal(fallBallPayBand("15-17 year-olds"), "fifteenSeventeen");
  });

  it("pays coach pitch $40, or $60 if that umpire has only one game that night", () => {
    assert.equal(fallBallAssignmentPay({ ageGroup: "8U CP", umpiresOnGame: 2, gamesThatNight: 2 }), 40);
    assert.equal(fallBallAssignmentPay({ ageGroup: "7U CP", umpiresOnGame: 1, gamesThatNight: 1 }), 60);
  });

  it("pays 9-12U $60, or $80 if that umpire has only one game that night", () => {
    assert.equal(fallBallAssignmentPay({ ageGroup: "9U", umpiresOnGame: 1, gamesThatNight: 2 }), 60);
    assert.equal(fallBallAssignmentPay({ ageGroup: "12U", umpiresOnGame: 1, gamesThatNight: 1 }), 80);
  });

  it("pays 13-14U $80 per game and 15-17U $60 with two umpires / $80 with one", () => {
    assert.equal(fallBallAssignmentPay({ ageGroup: "15U", umpiresOnGame: 1, gamesThatNight: 2 }), 80);
    assert.equal(fallBallAssignmentPay({ ageGroup: "17U", umpiresOnGame: 2, gamesThatNight: 1 }), 60);
    assert.equal(fallBallAssignmentPay({ ageGroup: "17U", umpiresOnGame: 1, gamesThatNight: 1 }), 80);
  });

  it("pays 12U $80 for the one game that night", () => {
    const rows = buildMainReportRows([assignedGame({ id: 1, age_group: "12U" })], FALL_BALL);
    assert.equal(rows[0]?.umpires[0]?.pay, 80);
    assert.equal(rows[0]?.gamePayTotal, 80);
  });

  it("pays 12U $60 each when the umpire works two games that night", () => {
    const games = [
      assignedGame({ id: 1, age_group: "12U", localized_time: "18:00" }),
      assignedGame({ id: 2, age_group: "10U", localized_time: "19:30" }),
    ];
    const rows = buildMainReportRows(games, FALL_BALL);
    assert.deepEqual(
      rows.map((row) => row.gamePayTotal),
      [60, 60],
    );
  });

  it("pays 8U CP $40 per game on a double and $60 for a one-game night", () => {
    const double = buildMainReportRows(
      [
        assignedGame({ id: 1, age_group: "8U CP", localized_time: "18:00" }),
        assignedGame({ id: 2, age_group: "8U CP", localized_time: "19:30" }),
      ],
      FALL_BALL,
    );
    assert.deepEqual(
      double.map((row) => row.umpires[0]?.pay),
      [40, 40],
    );
    const single = buildMainReportRows([assignedGame({ id: 3, age_group: "8U CP" })], FALL_BALL);
    assert.equal(single[0]?.umpires[0]?.pay, 60);
  });

  it("pays 13-14 $80 per game and $160 across two games", () => {
    const games = [
      assignedGame({ id: 1, age_group: "15U", localized_time: "18:00" }),
      assignedGame({ id: 2, age_group: "13-14", localized_time: "19:30" }),
    ];
    const rows = buildMainReportRows(games, FALL_BALL);
    assert.deepEqual(
      rows.map((row) => row.gamePayTotal),
      [80, 80],
    );
    const pay = buildUmpireReportRows(games, FALL_BALL);
    assert.equal(pay.length, 1);
    assert.equal(pay[0]?.games, 2);
    assert.equal(pay[0]?.totalPay, 160);
  });

  it("pays 17U $60 each with two umpires and $80 with one", () => {
    const twoMan = buildMainReportRows(
      [
        assignedGame({
          id: 1,
          age_group: "17U",
          officials: [
            { id: "1", first: "Sam", last: "Ump" },
            { id: "2", first: "Pat", last: "Plate" },
          ],
        }),
      ],
      FALL_BALL,
    );
    assert.deepEqual(
      twoMan[0]?.umpires.map((ump) => ump.pay),
      [60, 60],
    );
    const oneMan = buildMainReportRows([assignedGame({ id: 2, age_group: "17U" })], FALL_BALL);
    assert.equal(oneMan[0]?.umpires[0]?.pay, 80);
  });
});

describe("Little League and Diamond rates stay on their own table", () => {
  it("keeps 12U LLB at $50 and two-man 12U DYB at $50 each", () => {
    const singleLlb = buildMainReportRows([assignedGame({ id: 1, age_group: "12U LLB" })]);
    assert.equal(singleLlb[0]?.umpires[0]?.pay, 50);
    const twoMan = buildMainReportRows([
      assignedGame({
        id: 2,
        age_group: "12U DYB",
        officials: [
          { id: "1", first: "Sam", last: "Ump" },
          { id: "2", first: "Pat", last: "Plate" },
        ],
      }),
    ]);
    assert.deepEqual(
      twoMan[0]?.umpires.map((ump) => ump.pay),
      [50, 50],
    );
  });
});

describe("buildMainReportRows", () => {
  it("still lists unstaffed 7U games after the no-umpire divisions are filtered out", () => {
    const games = [
      game({ id: 1, age_group: "6U MOD", home_team: "Astros" }),
      game({ id: 2, age_group: "7U CP", home_team: "Cubs" }),
    ].filter((row) => gameUsesUmpires(String(row.age_group)));
    const rows = buildMainReportRows(games, FALL_BALL);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.ageGroup, "7U CP");
    assert.equal(rows[0]?.umpires.length, 0);
  });
});

function game(overrides: Partial<Game> & { id: number; age_group: string; home_team?: string }): Game {
  return {
    localized_date: "2026-09-29",
    localized_time: "18:00",
    home_team: "Astros",
    away_team: "Yankees",
    venue: "J Leo Stevens Park",
    subvenue: "Field 1",
    status: "S",
    ...overrides,
  } as Game;
}

function assignedGame(
  overrides: Partial<Game> & {
    id: number;
    age_group: string;
    officials?: Array<{ id: string; first: string; last: string }>;
  },
): Game {
  const officials = overrides.officials ?? [{ id: "1", first: "Sam", last: "Ump" }];
  const { officials: _ignored, ...rest } = overrides;
  return game({
    ...rest,
    _embedded: {
      assignments: officials.map((official) => ({
        _embedded: {
          official: {
            id: official.id,
            first_name: official.first,
            last_name: official.last,
          },
        },
      })),
    },
  });
}
