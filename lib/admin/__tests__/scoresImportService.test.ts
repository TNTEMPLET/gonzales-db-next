import assert from "node:assert/strict";
import { test } from "node:test";

import type { Game } from "@/lib/fetchGames";

import {
  buildScoresImportGameIndexes,
  buildScoresImportPreview,
  listAssignrCancelledGamesForUpload,
  matchScoresImportRow,
  parseScoresImportRow,
} from "@/lib/admin/scoresImportService";

function gameFixture(overrides: Partial<Game> & { id: string | number }): Game {
  return {
    id: overrides.id,
    home_team: overrides.home_team,
    away_team: overrides.away_team,
    start_time: overrides.start_time,
    localized_date: overrides.localized_date,
    localized_time: overrides.localized_time,
    age_group: overrides.age_group,
    status: overrides.status,
    subvenue: overrides.subvenue,
    _embedded: overrides._embedded,
  };
}

const baseGames: Game[] = [
  gameFixture({
    id: "13422195",
    home_team: "Bayou Glove Works - Todd",
    away_team: "Ascension Parks - Bennett",
    start_time: "2026-03-09T18:00:00.000Z",
    status: "A",
    subvenue: "3 - Gauthier and Amedee Field",
    _embedded: { venue: { name: "Stevens Park" } },
    age_group: "7U CP",
  }),
  gameFixture({
    id: "dup-1",
    home_team: "Team A",
    away_team: "Team B",
    start_time: "2026-03-10T18:00:00.000Z",
    status: "A",
    subvenue: "Field One",
    _embedded: { venue: { name: "Stevens Park" } },
    age_group: "7U CP",
  }),
  gameFixture({
    id: "dup-2",
    home_team: "Team A",
    away_team: "Team B",
    start_time: "2026-03-10T18:00:00.000Z",
    status: "A",
    subvenue: "Field Two",
    _embedded: { venue: { name: "Stevens Park" } },
    age_group: "7U CP",
  }),
  gameFixture({
    id: "rain-1",
    home_team: "Team C",
    away_team: "Team D",
    start_time: "2026-03-11T18:00:00.000Z",
    status: "C",
    subvenue: "Field Three",
    _embedded: { venue: { name: "Stevens Park" } },
    age_group: "7U CP",
  }),
];

test("matches rows by Match ID", () => {
  const indexes = buildScoresImportGameIndexes(baseGames);
  const row = parseScoresImportRow(
    {
      "Match ID": "13422195",
      "Home Team": "Bayou Glove Works - Todd",
      "Away Team": "Ascension Parks - Bennett",
      Date: "03/09/2026",
      "Start Time": "6:00 PM",
      Location: "Stevens Park",
      Field: "3 - Gauthier and Amedee Field",
      "Home Team Score": "5",
      "Away Team Score": "4",
    },
    2,
  );

  const result = matchScoresImportRow({
    row,
    indexes,
    mappings: { parkMappings: {}, fieldMappings: {} },
  });

  assert.equal(result.kind, "matched");
  if (result.kind === "matched") {
    assert.equal(String(result.game.id), "13422195");
    assert.equal(result.homeScore, 5);
    assert.equal(result.awayScore, 4);
  }
});

test("falls back to home, away, date, and time matching", () => {
  const indexes = buildScoresImportGameIndexes(baseGames);
  const row = parseScoresImportRow(
    {
      "Home Team": "Bayou Glove Works - Todd",
      "Away Team": "Ascension Parks - Bennett",
      Date: "03/09/2026",
      "Start Time": "6:00 PM",
      "Home Team Score": "5",
      "Away Team Score": "4",
    },
    2,
  );

  const result = matchScoresImportRow({
    row,
    indexes,
    mappings: { parkMappings: {}, fieldMappings: {} },
  });

  assert.equal(result.kind, "matched");
  if (result.kind === "matched") {
    assert.equal(String(result.game.id), "13422195");
  }
});

test("disambiguates duplicate team and date rows with mapped sub-venue", () => {
  const indexes = buildScoresImportGameIndexes(baseGames);
  const row = parseScoresImportRow(
    {
      "Home Team": "Team A",
      "Away Team": "Team B",
      Date: "03/10/2026",
      Location: "Stevens Park",
      Field: "Field Two",
      "Home Team Score": "2",
      "Away Team Score": "1",
    },
    2,
  );

  const result = matchScoresImportRow({
    row,
    indexes,
    mappings: {
      parkMappings: { "Stevens Park": "Stevens Park" },
      fieldMappings: { "stevens park::field two": "Field Two" },
    },
  });

  assert.equal(result.kind, "matched");
  if (result.kind === "matched") {
    assert.equal(String(result.game.id), "dup-2");
  }
});

test("skips rows with missing scores", () => {
  const indexes = buildScoresImportGameIndexes(baseGames);
  const row = parseScoresImportRow(
    {
      "Match ID": "13422195",
      "Home Team Score": "",
      "Away Team Score": "4",
    },
    2,
  );

  const result = matchScoresImportRow({
    row,
    indexes,
    mappings: { parkMappings: {}, fieldMappings: {} },
  });

  assert.equal(result.kind, "skippedMissingScore");
});

test("skips non-active games after matching", () => {
  const indexes = buildScoresImportGameIndexes(baseGames);
  const row = parseScoresImportRow(
    {
      "Match ID": "rain-1",
      "Home Team": "Team C",
      "Away Team": "Team D",
      "Home Team Score": "1",
      "Away Team Score": "0",
    },
    2,
  );

  const result = matchScoresImportRow({
    row,
    indexes,
    mappings: { parkMappings: {}, fieldMappings: {} },
  });

  assert.equal(result.kind, "skippedRainedOut");
});

test("buildScoresImportPreview summarizes row outcomes", () => {
  const preview = buildScoresImportPreview({
    rows: [
      {
        "Match ID": "13422195",
        "Home Team Score": "5",
        "Away Team Score": "4",
      },
      {
        "Match ID": "missing-game",
        "Home Team Score": "1",
        "Away Team Score": "0",
      },
      {
        "Match ID": "rain-1",
        "Home Team Score": "2",
        "Away Team Score": "1",
      },
      {
        "Match ID": "13422195",
        "Home Team Score": "",
        "Away Team Score": "",
      },
    ],
    games: baseGames,
  });

  assert.equal(preview.summary.processed, 4);
  assert.equal(preview.summary.matched, 1);
  assert.equal(preview.summary.unmatched, 1);
  assert.equal(preview.summary.skippedMissingScore, 1);
  assert.equal(preview.summary.skippedRainedOut, 1);
  assert.equal(preview.unmatchedRows.length, 1);
  assert.equal(preview.cancelledRows.length, 1);
  assert.equal(preview.assignrCancelledGames.length, 1);
  assert.equal(preview.requiresCancelledAcknowledgement, true);
});

test("lists assignr cancelled games that overlap the upload", () => {
  const rows = [
    parseScoresImportRow(
      {
        "Match ID": "rain-1",
        Date: "03/11/2026",
      },
      2,
    ),
  ];

  const cancelledGames = listAssignrCancelledGamesForUpload(baseGames, rows);
  assert.equal(cancelledGames.length, 1);
  assert.equal(cancelledGames[0]?.gameExternalId, "rain-1");
});

test("excludes unscored rows on assignr cancelled dates from import matching", () => {
  const preview = buildScoresImportPreview({
    rows: [
      {
        "Match ID": "rain-1",
        Date: "03/11/2026",
        "Home Team Score": "",
        "Away Team Score": "",
      },
    ],
    games: baseGames,
  });

  assert.equal(preview.summary.unmatched, 0);
  assert.equal(preview.summary.skippedRainedOut, 1);
  assert.equal(preview.cancelledRows[0]?.reason, "Assignr cancelled game removed from import");
});
