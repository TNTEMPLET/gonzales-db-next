import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateThreeTeamDoubleheaders } from "../threeTeamDoubleheaders";
import type {
  SchedulerAvailability,
  SchedulerDivisionRule,
  SchedulerField,
  SchedulerSeason,
  SchedulerTeam,
} from "../types";

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe("three-team doubleheaders", () => {
  it("places two games per night and rotates the DH team", () => {
    const season: SchedulerSeason = {
      id: "season",
      organizationId: "fallball",
      seasonYear: 2026,
      name: "Fall",
      startsOn: utcDate(2026, 9, 28),
      endsOn: utcDate(2026, 10, 7),
      defaultGameTimes: ["17:45", "19:15"],
      settings: { gamesPerTeam: 10, gamesStartsOn: "2026-09-28", gamesEndsOn: "2026-10-07" },
    };
    const teams: SchedulerTeam[] = ["Astros", "Cubs", "Yankees"].map((name) => ({
      id: name,
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroup: "17U",
      teamName: name,
    }));
    const fields: SchedulerField[] = [
      {
        id: "velo",
        organizationId: "fallball",
        parkId: "tjp",
        name: "Velo",
        shortName: "V",
        supportedAgeGroups: ["17U"],
        supportedDivisions: ["17U"],
        isActive: true,
      },
    ];
    const availabilities: SchedulerAvailability[] = [1, 3].flatMap((dayOfWeek) =>
      ["17:45", "19:15"].map((startTime) => ({
        id: `velo-${dayOfWeek}-${startTime}`,
        organizationId: "fallball",
        seasonId: "season",
        parkId: "tjp",
        fieldId: "velo",
        availabilityType: "AVAILABLE" as const,
        date: null,
        dayOfWeek,
        startTime,
        endTime: null,
        notes: "17U",
      })),
    );
    const rule: SchedulerDivisionRule = {
      id: "r17",
      organizationId: "fallball",
      seasonId: "season",
      division: "17U",
      ageGroup: "17U",
      preferredParkId: null,
      preferredFieldId: null,
      allowedParkIds: [],
      allowedFieldIds: [],
      allowedGameTimes: [],
      minDaysBetweenGames: null,
      maxGamesPerWeek: null,
      avoidBackToBack: false,
      ruleMetadata: { scheduleMode: "manual", allowDoubleHeaders: true },
    };

    const result = generateThreeTeamDoubleheaders({
      organizationId: "fallball",
      season,
      teams,
      fields,
      availabilities,
      rules: [rule],
      divisions: ["17U"],
    });

    const placed = result.games.filter((game) => game.gameDate && game.startTime);
    const byDate = new Map<string, typeof placed>();
    for (const game of placed) {
      const key = game.gameDate!.toISOString().slice(0, 10);
      byDate.set(key, [...(byDate.get(key) ?? []), game]);
    }
    assert.ok(placed.length >= 4);
    for (const night of byDate.values()) {
      assert.equal(night.length, 2);
      const counts = new Map<string, number>();
      for (const game of night) {
        counts.set(game.homeTeamId, (counts.get(game.homeTeamId) ?? 0) + 1);
        counts.set(game.awayTeamId, (counts.get(game.awayTeamId) ?? 0) + 1);
      }
      const dhCount = [...counts.values()].filter((value) => value === 2).length;
      assert.equal(dhCount, 1);
    }
    const firstNight = [...byDate.values()][0]!;
    const dh = [firstNight[0]!.homeTeamId, firstNight[0]!.awayTeamId, firstNight[1]!.homeTeamId, firstNight[1]!.awayTeamId]
      .find((id, _, list) => list.filter((item) => item === id).length === 2);
    assert.equal(firstNight[0]!.homeTeamId, dh);
    assert.equal(firstNight[1]!.awayTeamId, dh);
  });

  it("keeps home/away and each pairing within one over a full DH season", () => {
    const season: SchedulerSeason = {
      id: "season",
      organizationId: "fallball",
      seasonYear: 2026,
      name: "Fall",
      startsOn: utcDate(2026, 9, 28),
      endsOn: utcDate(2026, 10, 19),
      defaultGameTimes: ["17:45", "19:15"],
      settings: { gamesPerTeam: 10, gamesStartsOn: "2026-09-28", gamesEndsOn: "2026-10-19" },
    };
    const teams: SchedulerTeam[] = ["Dodgers - Williams", "Red Sox - Edmonston", "Yankees - Zeigler"].map((name) => ({
      id: name,
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroup: "17U",
      teamName: name,
    }));
    const fields: SchedulerField[] = [
      {
        id: "f2",
        organizationId: "fallball",
        parkId: "clouatre",
        name: "Field 2",
        shortName: "2",
        supportedAgeGroups: ["17U"],
        supportedDivisions: ["17U"],
        isActive: true,
      },
    ];
    const availabilities: SchedulerAvailability[] = [1, 3].flatMap((dayOfWeek) =>
      ["17:45", "19:15"].map((startTime) => ({
        id: `f2-${dayOfWeek}-${startTime}`,
        organizationId: "fallball",
        seasonId: "season",
        parkId: "clouatre",
        fieldId: "f2",
        availabilityType: "AVAILABLE" as const,
        date: null,
        dayOfWeek,
        startTime,
        endTime: null,
        notes: "17U",
      })),
    );
    const result = generateThreeTeamDoubleheaders({
      organizationId: "fallball",
      season,
      teams,
      fields,
      availabilities,
      rules: [
        {
          id: "r17",
          organizationId: "fallball",
          seasonId: "season",
          division: "17U",
          ageGroup: "17U",
          preferredParkId: null,
          preferredFieldId: null,
          allowedParkIds: [],
          allowedFieldIds: [],
          allowedGameTimes: [],
          minDaysBetweenGames: null,
          maxGamesPerWeek: null,
          avoidBackToBack: false,
          ruleMetadata: { scheduleMode: "manual", allowDoubleHeaders: true },
        },
      ],
      divisions: ["17U"],
    });
    const placed = result.games.filter((game) => game.gameDate && game.startTime);
    const home = new Map<string, number>();
    const away = new Map<string, number>();
    const pair = new Map<string, number>();
    for (const game of placed) {
      home.set(game.homeTeamId, (home.get(game.homeTeamId) ?? 0) + 1);
      away.set(game.awayTeamId, (away.get(game.awayTeamId) ?? 0) + 1);
      pair.set(`${game.homeTeamId}::${game.awayTeamId}`, (pair.get(`${game.homeTeamId}::${game.awayTeamId}`) ?? 0) + 1);
    }
    for (const team of teams) {
      const skew = Math.abs((home.get(team.id) ?? 0) - (away.get(team.id) ?? 0));
      assert.ok(skew <= 1, `${team.teamName} home/away skew ${skew}`);
    }
    for (let i = 0; i < teams.length; i += 1) {
      for (let j = i + 1; j < teams.length; j += 1) {
        const a = teams[i]!.id;
        const b = teams[j]!.id;
        const ab = pair.get(`${a}::${b}`) ?? 0;
        const ba = pair.get(`${b}::${a}`) ?? 0;
        assert.ok(Math.abs(ab - ba) <= 1, `${a} vs ${b} pairing ${ab}-${ba}`);
      }
    }
  });
});
