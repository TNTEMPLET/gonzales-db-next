import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_SEASON_GAMES_PER_TEAM, parseSeasonGamesPerTeam } from "../seasonWindows";

describe("season gamesPerTeam", () => {
  it("defaults to 10 when unset", () => {
    assert.equal(parseSeasonGamesPerTeam({}), DEFAULT_SEASON_GAMES_PER_TEAM);
    assert.equal(parseSeasonGamesPerTeam(null), DEFAULT_SEASON_GAMES_PER_TEAM);
  });

  it("reads a whole number from season settings", () => {
    assert.equal(parseSeasonGamesPerTeam({ gamesPerTeam: 8 }), 8);
    assert.equal(parseSeasonGamesPerTeam({ gamesPerTeam: "12" }), 12);
  });
});
