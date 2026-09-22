import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultScoreQueueDateKey,
  filterScoreQueueGames,
  nextUnscoredGame,
} from "@/lib/admin/scoreQueueHelpers";
import type { UnifiedScoreGame } from "@/lib/admin/unifiedScoreSources";

function game(
  overrides: Partial<UnifiedScoreGame> & Pick<UnifiedScoreGame, "id" | "gameDate" | "scored">,
): UnifiedScoreGame {
  return {
    sourceType: "LEAGUE",
    organizationId: "gonzales",
    organizationLabel: "Gonzales",
    seasonYear: 2026,
    sourceKey: "league",
    sourceLabel: "League",
    gameExternalId: overrides.id,
    matchId: overrides.id,
    ageGroup: "10U",
    homeTeam: "Home",
    awayTeam: "Away",
    dateLabel: "Apr 14",
    timeLabel: "6:00 PM",
    venue: "Stevens",
    field: "1",
    gameNumber: null,
    status: "A",
    homeScore: overrides.scored ? 5 : null,
    awayScore: overrides.scored ? 3 : null,
    canManualScore: true,
    hasGameChanger: false,
    ...overrides,
  };
}

test("defaultScoreQueueDateKey prefers the most recent night that still needs scores", () => {
  const asOf = new Date("2026-04-16T18:00:00.000Z");
  const dateKey = defaultScoreQueueDateKey(
    [
      game({ id: "a", gameDate: "2026-04-14T12:00:00.000Z", scored: true }),
      game({ id: "b", gameDate: "2026-04-14T12:00:00.000Z", scored: false }),
      game({ id: "c", gameDate: "2026-04-15T12:00:00.000Z", scored: true }),
    ],
    asOf,
  );
  assert.equal(dateKey, "2026-04-14");
});

test("filterScoreQueueGames hides scored rows unless showScored is on", () => {
  const games = [
    game({ id: "a", gameDate: "2026-04-14T12:00:00.000Z", scored: false, ageGroup: "10U" }),
    game({ id: "b", gameDate: "2026-04-14T12:00:00.000Z", scored: true, ageGroup: "10U" }),
    game({ id: "c", gameDate: "2026-04-15T12:00:00.000Z", scored: false, ageGroup: "12U" }),
  ];
  const visible = filterScoreQueueGames(games, {
    parkName: "ALL",
    ageGroup: "ALL",
    dateKey: "2026-04-14",
    showScored: false,
  });
  assert.deepEqual(
    visible.map((row) => row.id),
    ["a"],
  );
});

test("filterScoreQueueGames can narrow to one park", () => {
  const games = [
    game({ id: "a", gameDate: "2026-04-14T12:00:00.000Z", scored: false, venue: "Stevens Park" }),
    game({ id: "b", gameDate: "2026-04-14T12:00:00.000Z", scored: false, venue: "Tee-Joe Gonzales Park" }),
  ];
  const visible = filterScoreQueueGames(games, {
    parkName: "Stevens Park",
    ageGroup: "ALL",
    dateKey: "ALL",
    showScored: false,
  });
  assert.deepEqual(
    visible.map((row) => row.id),
    ["a"],
  );
});

test("nextUnscoredGame skips the current row and already-scored games", () => {
  const games = [
    game({ id: "a", gameDate: "2026-04-14T12:00:00.000Z", scored: false }),
    game({ id: "b", gameDate: "2026-04-14T12:00:00.000Z", scored: true }),
    game({ id: "c", gameDate: "2026-04-14T12:00:00.000Z", scored: false }),
  ];
  assert.equal(nextUnscoredGame(games, "a")?.id, "c");
  assert.equal(nextUnscoredGame(games, "c"), null);
});
