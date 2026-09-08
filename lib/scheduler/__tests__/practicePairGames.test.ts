import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateGamesFromPracticePairs } from "../practicePairGames";
import type { SchedulerField, SchedulerSeason, SchedulerTeam } from "../types";

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe("practice pair games", () => {
  it("expands a shared-field pair onto games-window weekdays", () => {
    const astros: SchedulerTeam = {
      id: "a",
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroup: "4U TB",
      teamName: "Astros",
    };
    const cubs: SchedulerTeam = {
      id: "c",
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroup: "4U TB",
      teamName: "Cubs",
    };
    const season: SchedulerSeason = {
      id: "season",
      organizationId: "fallball",
      seasonYear: 2026,
      name: "Fall",
      startsOn: utcDate(2026, 9, 6),
      endsOn: utcDate(2026, 10, 31),
      defaultGameTimes: ["17:45"],
      settings: { gamesStartsOn: "2026-09-28", gamesEndsOn: "2026-10-05" },
    };
    const fields: SchedulerField[] = [
      {
        id: "tball",
        organizationId: "fallball",
        parkId: "tjp",
        name: "Tee Ball",
        shortName: "TB",
        supportedAgeGroups: ["4U TB"],
        supportedDivisions: ["4U TB"],
        isActive: true,
      },
    ];

    const result = generateGamesFromPracticePairs({
      organizationId: "fallball",
      season,
      teams: [astros, cubs],
      fields,
      divisions: ["4U TB"],
      pairs: [
        {
          ageGroup: "4U TB",
          dayOfWeek: 1,
          startTime: "17:45",
          parkId: "tjp",
          fieldId: "tball",
          home: astros,
          away: cubs,
        },
      ],
    });

    const mondays = result.games.filter((game) => game.gameDate && game.gameDate.getUTCDay() === 1);
    assert.ok(mondays.length >= 1);
    assert.ok(mondays.every((game) => game.homeTeamName === "Astros" && game.awayTeamName === "Cubs"));
    assert.ok(mondays.every((game) => game.fieldId === "tball" && game.startTime === "17:45"));
  });
});
