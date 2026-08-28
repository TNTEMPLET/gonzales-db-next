import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterAssignrGamesForContentOrg,
  gameBelongsToContentOrg,
} from "@/lib/admin/assignrOrgScope";
import type { Game } from "@/lib/fetchGames";

describe("assignr org scoping", () => {
  it("matches games by embedded league id", () => {
    const game = {
      id: 1,
      _embedded: { league: { id: "515712" } },
    } as Game;
    assert.equal(gameBelongsToContentOrg(game, "gonzales"), true);
    assert.equal(gameBelongsToContentOrg(game, "ascension"), false);
  });

  it("matches uploaded games without league id by age group", () => {
    const game = {
      id: 2,
      age_group: "15U DBB",
      localized_date: "May 18 2026",
    } as Game;
    assert.equal(gameBelongsToContentOrg(game, "gonzales"), true);
    assert.equal(filterAssignrGamesForContentOrg([game], "gonzales").length, 1);
  });
});
