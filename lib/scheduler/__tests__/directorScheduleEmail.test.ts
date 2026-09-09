import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDirectorScheduleEmail,
  compareFieldNames,
  directorDateLabel,
  directorParksFromGames,
  filterDirectorGames,
  groupDirectorGames,
  parseDirectorEmails,
  sortDirectorGames,
  type DirectorScheduleGame,
} from "../directorScheduleEmail";

function game(partial: Partial<DirectorScheduleGame> & Pick<DirectorScheduleGame, "fieldName" | "division" | "date">): DirectorScheduleGame {
  return {
    parkId: "paula",
    parkName: "Paula Park",
    fieldId: partial.fieldName,
    startTime: "17:45",
    homeTeamName: "Yankees",
    awayTeamName: "Dodgers",
    ...partial,
  };
}

describe("directorScheduleEmail", () => {
  it("parses, lowercases, and dedupes typed director emails", () => {
    const parsed = parseDirectorEmails("Pat@League.org, pat@league.org\nbad\nbo@park.com; also@park.com");
    assert.deepEqual(parsed.emails, ["pat@league.org", "bo@park.com", "also@park.com"]);
    assert.equal(parsed.skipped, 1);
  });

  it("sorts numbered fields before named fields", () => {
    assert.ok(compareFieldNames("Field 4", "Field 6") < 0);
    assert.ok(compareFieldNames("6", "Field 4") > 0);
    assert.ok(compareFieldNames("Bourque", "Velo") < 0);
  });

  it("groups by park then day, and sorts field, division, time inside a day", () => {
    const rows = sortDirectorGames([
      game({ parkId: "stevens", parkName: "J Leo Stevens Park", fieldName: "Field 1", division: "6U MOD", date: "2026-09-28", startTime: "18:00", homeTeamName: "Astros", awayTeamName: "Cubs" }),
      game({ fieldName: "Field 6", division: "4U TB", date: "2026-09-28", homeTeamName: "Astros", awayTeamName: "Yankees" }),
      game({ fieldName: "Field 4", division: "5U TB", date: "2026-09-28", homeTeamName: "Mets", awayTeamName: "Cubs" }),
      game({ fieldName: "Field 4", division: "4U TB", date: "2026-09-28", startTime: "18:30", homeTeamName: "Red Sox", awayTeamName: "Giants" }),
      game({ fieldName: "Field 4", division: "4U TB", date: "2026-09-28", homeTeamName: "Yankees", awayTeamName: "Dodgers" }),
      game({ fieldName: "Field 4", division: "4U TB", date: "2026-09-30", homeTeamName: "Yankees", awayTeamName: "Dodgers" }),
    ]);
    const parks = groupDirectorGames(rows);
    assert.deepEqual(
      parks.map((park) => park.parkName),
      ["J Leo Stevens Park", "Paula Park"],
    );
    const paula = parks[1]!;
    assert.deepEqual(
      paula.days.map((day) => day.date),
      ["2026-09-28", "2026-09-30"],
    );
    assert.equal(directorDateLabel("2026-09-28"), "Monday, 9/28/2026");
    assert.deepEqual(
      paula.days[0]!.rows.map((row) => `${row.fieldName}|${row.division}|${row.startTime}|${row.homeTeamName}`),
      [
        "Field 4|4U TB|17:45|Yankees",
        "Field 4|4U TB|18:30|Red Sox",
        "Field 4|5U TB|17:45|Mets",
        "Field 6|4U TB|17:45|Astros",
      ],
    );
  });

  it("filters to checked parks and builds a board email", () => {
    const games = [
      game({ fieldName: "Field 4", division: "4U TB", date: "2026-09-28" }),
      game({ parkId: "stevens", parkName: "J Leo Stevens Park", fieldName: "Field 1", division: "6U MOD", date: "2026-09-28" }),
    ];
    assert.deepEqual(
      directorParksFromGames(games).map((park) => park.parkName),
      ["J Leo Stevens Park", "Paula Park"],
    );
    const paulaOnly = filterDirectorGames(games, ["paula"]);
    assert.equal(paulaOnly.length, 1);
    assert.equal(paulaOnly[0]?.parkName, "Paula Park");

    const email = buildDirectorScheduleEmail({
      orgName: "AP Fall Ball",
      seasonName: "Fall Ball 2026",
      games: paulaOnly,
      gamesWindow: "9/27/2026 – 10/31/2026",
    });
    assert.match(email.subject, /Paula Park/);
    assert.match(email.text, /attached as a PDF/);
    assert.match(email.text, /Paula Park — 1 game/);
    assert.doesNotMatch(email.text, /Stevens|Field 4 · 4U TB|Yankees vs Dodgers/);
    assert.match(email.html, /attached as a PDF/);
    assert.match(email.html, /Paula Park — 1 game/);
    assert.doesNotMatch(email.html, /<table|<h2|Stevens|Yankees vs Dodgers/);
    assert.doesNotMatch(email.html, /Assignr|SportsConnect|GameChanger|roundLabel/);
  });
});
