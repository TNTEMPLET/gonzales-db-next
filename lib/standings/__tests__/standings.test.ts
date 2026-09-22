import assert from "node:assert/strict";
import { test } from "node:test";

import { computeStandingsByAgeGroup, filterScoresForSeasonGames } from "@/lib/standings";

test("filterScoresForSeasonGames keeps only posted active-season ids", () => {
  const filtered = filterScoresForSeasonGames(
    [
      { gameExternalId: "season-1", homeScore: 5 },
      { gameExternalId: "old-assignr-99", homeScore: 9 },
      { gameExternalId: "season-2", homeScore: 1 },
    ],
    ["season-1", "season-2"],
  );
  assert.deepEqual(
    filtered.map((row) => row.gameExternalId),
    ["season-1", "season-2"],
  );
});

test("filterScoresForSeasonGames returns empty when the season has no posted games", () => {
  const filtered = filterScoresForSeasonGames(
    [{ gameExternalId: "anything", homeScore: 4 }],
    [],
  );
  assert.deepEqual(filtered, []);
});

test("computeStandingsByAgeGroup still ranks by winning percentage", () => {
  const standings = computeStandingsByAgeGroup([
    {
      gameExternalId: "g1",
      ageGroup: "10U",
      homeTeam: "Tigers",
      awayTeam: "Cubs",
      homeScore: 6,
      awayScore: 2,
    },
  ]);
  assert.equal(standings[0]?.ageGroup, "10U");
  assert.equal(standings[0]?.rows[0]?.team, "Tigers");
  assert.equal(standings[0]?.rows[0]?.wins, 1);
});
