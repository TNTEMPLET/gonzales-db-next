import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  selectGamesAtMyParks,
  type ParkDirectorGameSource,
} from "@/lib/admin/parkDirector/gamesAtMyParks";
import { getContentOrgBrandColors, getOrgDisplayName } from "@/lib/siteConfig";

const RANGE = { startDate: "2026-06-02", endDate: "2026-06-04" };

function game(overrides: Partial<ParkDirectorGameSource> & Pick<ParkDirectorGameSource, "id">): ParkDirectorGameSource {
  return {
    organizationId: "gonzales",
    status: "LOCKED",
    gameDate: new Date("2026-06-02T18:00:00.000Z"),
    startTime: "18:00",
    division: "10U",
    ageGroup: "10U",
    homeTeamName: "Home Nine",
    awayTeamName: "Away Nine",
    park: {
      id: "park-north-g",
      name: "North Park Gonzales",
      venueId: "venue-north",
      venue: { id: "venue-north", name: "North Park" },
    },
    field: { id: "field-1", name: "Field 1" },
    ...overrides,
  };
}

describe("games at my parks", () => {
  it("returns posted games at assigned venues across leagues, sorted by time", () => {
    const games = selectGamesAtMyParks(
      [
        { venueId: "venue-north", active: true },
        { venueId: "venue-east", active: false },
      ],
      [
        game({
          id: "g-late",
          organizationId: "gonzales",
          startTime: "18:00",
          gameDate: new Date("2026-06-02T18:00:00.000Z"),
        }),
        game({
          id: "a-early",
          organizationId: "ascension",
          startTime: "9:00",
          gameDate: new Date("2026-06-02T14:00:00.000Z"),
          park: {
            id: "park-north-a",
            name: "North Park Ascension",
            venueId: "venue-north",
            venue: { id: "venue-north", name: "North Park" },
          },
          field: null,
        }),
        game({
          id: "f-next",
          organizationId: "fallball",
          status: "EXPORTED",
          startTime: "10:00",
          gameDate: new Date("2026-06-03T15:00:00.000Z"),
        }),
        game({
          id: "east-game",
          park: {
            id: "park-east",
            name: "East Park",
            venueId: "venue-east",
            venue: { id: "venue-east", name: "East Park" },
          },
        }),
        game({
          id: "draft-game",
          status: "DRAFT",
        }),
        game({
          id: "canceled-game",
          status: "CANCELED",
        }),
        game({
          id: "unlinked",
          park: {
            id: "park-open",
            name: "Unlinked Park",
            venueId: null,
            venue: null,
          },
        }),
        game({
          id: "before",
          gameDate: new Date("2026-06-01T18:00:00.000Z"),
        }),
        game({
          id: "after",
          gameDate: new Date("2026-06-05T00:00:00.000Z"),
        }),
        game({
          id: "no-away",
          awayTeamName: "  ",
        }),
      ],
      RANGE,
    );

    assert.deepEqual(
      games.map((row) => row.id),
      ["a-early", "g-late", "f-next"],
    );
    assert.equal(games[0]?.organizationLabel, getOrgDisplayName("ascension"));
    assert.equal(games[0]?.leaguePrimaryHex, getContentOrgBrandColors("ascension").primaryHex);
    assert.equal(games[0]?.leagueAccentHex, getContentOrgBrandColors("ascension").accentHex);
    assert.equal(games[0]?.fieldId, null);
    assert.equal(games[0]?.venueName, "North Park");
    assert.equal(games[0]?.parkName, "North Park Ascension");
    assert.equal(games[1]?.leaguePrimaryHex, getContentOrgBrandColors("gonzales").primaryHex);
    assert.equal(games[2]?.status, "EXPORTED");
    assert.equal(games[2]?.organizationLabel, getOrgDisplayName("fallball"));
  });

  it("includes the first and last dates and orders same-time games by league then id", () => {
    const games = selectGamesAtMyParks(
      [{ venueId: "venue-north", active: true }],
      [
        game({
          id: "z-end",
          gameDate: new Date("2026-06-04T23:30:00.000Z"),
          startTime: "18:30",
        }),
        game({
          id: "b-same",
          organizationId: "gonzales",
          gameDate: new Date("2026-06-02T12:00:00.000Z"),
          startTime: "18:00",
        }),
        game({
          id: "a-same",
          organizationId: "gonzales",
          gameDate: new Date("2026-06-02T12:00:00.000Z"),
          startTime: "18:00",
        }),
        game({
          id: "asc-same",
          organizationId: "ascension",
          gameDate: new Date("2026-06-02T12:00:00.000Z"),
          startTime: "18:00",
        }),
      ],
      RANGE,
    );
    assert.deepEqual(
      games.map((row) => row.id),
      ["asc-same", "a-same", "b-same", "z-end"],
    );
  });

  it("returns nothing when the director has no active parks or the range is invalid", () => {
    const rows = [game({ id: "kept" })];
    assert.deepEqual(selectGamesAtMyParks([], rows, RANGE), []);
    assert.deepEqual(
      selectGamesAtMyParks([{ venueId: "venue-north", active: false }], rows, RANGE),
      [],
    );
    assert.deepEqual(
      selectGamesAtMyParks([{ venueId: "venue-north", active: true }], rows, {
        startDate: "2026-06-04",
        endDate: "2026-06-02",
      }),
      [],
    );
    assert.deepEqual(
      selectGamesAtMyParks([{ venueId: "venue-north", active: true }], rows, {
        startDate: "June 2",
        endDate: "2026-06-04",
      }),
      [],
    );
  });
});
