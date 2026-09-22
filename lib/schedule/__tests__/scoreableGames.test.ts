import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterPastScoreableGames,
  filterScoreEntryParks,
  isPastKickoff,
  isScoreEntryPark,
  leagueOrgsFromScope,
  normalizeClockHm,
} from "@/lib/schedule/scoreableGames";

test("normalizeClockHm pads 24h times", () => {
  assert.equal(normalizeClockHm("6:00"), "06:00");
  assert.equal(normalizeClockHm("17:45"), "17:45");
  assert.equal(normalizeClockHm("not-a-time"), null);
});

test("isPastKickoff uses the Chicago calendar date, not UTC", () => {
  const asOf = new Date("2026-04-15T18:00:00.000Z");
  assert.equal(isPastKickoff("2026-04-14", "18:00", asOf), true);
  assert.equal(isPastKickoff("2026-04-16", "18:00", asOf), false);
  assert.equal(isPastKickoff("2026-04-15", "12:00", asOf), true);
  assert.equal(isPastKickoff("2026-04-15", "23:00", asOf), false);
});

test("filterPastScoreableGames keeps only games that have started", () => {
  const asOf = new Date("2026-04-15T18:00:00.000Z");
  const kept = filterPastScoreableGames(
    [
      { dateKey: "2026-04-14", startTime: "18:00" },
      { dateKey: "2026-04-15", startTime: "23:00" },
      { dateKey: "2026-04-16", startTime: "18:00" },
    ],
    asOf,
  );
  assert.deepEqual(
    kept.map((game) => game.dateKey),
    ["2026-04-14"],
  );
});

test("Paula Park games are excluded from score entry", () => {
  assert.equal(isScoreEntryPark("Paula Park"), false);
  assert.equal(isScoreEntryPark("J Leo Stevens Park"), true);
  assert.deepEqual(
    filterScoreEntryParks([
      { parkName: "Paula Park" },
      { parkName: "J Leo Stevens Park" },
      { parkName: "Tee-Joe Gonzales Park" },
    ]).map((game) => game.parkName),
    ["J Leo Stevens Park", "Tee-Joe Gonzales Park"],
  );
});

test("leagueOrgsFromScope expands All Sites and keeps a single content org", () => {
  assert.deepEqual(leagueOrgsFromScope("gonzales"), ["gonzales"]);
  assert.deepEqual(leagueOrgsFromScope("all"), ["gonzales", "ascension", "fallball"]);
});
