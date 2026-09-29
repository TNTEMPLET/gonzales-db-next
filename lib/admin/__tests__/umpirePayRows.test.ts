import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMainReportRows,
  gameUsesUmpires,
} from "../umpirePayRows";
import type { Game } from "@/lib/fetchGames";

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

describe("buildMainReportRows", () => {
  it("still lists unstaffed 7U games after the no-umpire divisions are filtered out", () => {
    const games = [
      game({ id: 1, age_group: "6U MOD", home_team: "Astros" }),
      game({ id: 2, age_group: "7U CP", home_team: "Cubs" }),
    ].filter((row) => gameUsesUmpires(String(row.age_group)));
    const rows = buildMainReportRows(games);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.ageGroup, "7U CP");
    assert.equal(rows[0]?.umpires.length, 0);
  });
});

function game(overrides: Partial<Game> & { id: number; age_group: string; home_team: string }): Game {
  return {
    localized_date: "2026-09-29",
    localized_time: "18:00",
    away_team: "Yankees",
    venue: "J Leo Stevens Park",
    subvenue: "Field 1",
    status: "S",
    ...overrides,
  } as Game;
}
