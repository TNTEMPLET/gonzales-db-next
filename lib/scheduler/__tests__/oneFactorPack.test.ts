import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateSchedule } from "../generator";
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

const RULE: SchedulerDivisionRule = {
  id: "rule-9u",
  organizationId: "fallball",
  seasonId: "season",
  division: "9U",
  ageGroup: "9U",
  preferredParkId: null,
  preferredFieldId: null,
  allowedParkIds: [],
  allowedFieldIds: [],
  allowedGameTimes: [],
  minDaysBetweenGames: null,
  maxGamesPerWeek: 2,
  avoidBackToBack: true,
  ruleMetadata: { allowDoubleHeaders: false },
};

describe("one-factor generate", () => {
  it("places every 9U-style game when each night is a full 1-factor", () => {
    const season: SchedulerSeason = {
      id: "season",
      organizationId: "fallball",
      seasonYear: 2026,
      name: "Fall",
      startsOn: utcDate(2026, 9, 29),
      endsOn: utcDate(2026, 10, 1),
      defaultGameTimes: ["17:45", "19:15"],
    };
    const teams: SchedulerTeam[] = ["A", "B", "C", "D"].map((name) => ({
      id: name,
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroup: "9U",
      teamName: name,
    }));
    const fields: SchedulerField[] = [
      {
        id: "aldridge",
        organizationId: "fallball",
        parkId: "tjp",
        name: "Aldridge",
        shortName: "A",
        supportedAgeGroups: ["9U"],
        supportedDivisions: ["9U"],
        isActive: true,
      },
      {
        id: "bourque",
        organizationId: "fallball",
        parkId: "tjp",
        name: "Bourque",
        shortName: "B",
        supportedAgeGroups: ["9U"],
        supportedDivisions: ["9U"],
        isActive: true,
      },
    ];
    const availabilities: SchedulerAvailability[] = [2, 4].flatMap((dayOfWeek) =>
      fields.flatMap((field) =>
        ["17:45", "19:15"].map((startTime, index) => ({
          id: `${field.id}-${dayOfWeek}-${startTime}`,
          organizationId: "fallball",
          seasonId: "season",
          parkId: "tjp",
          fieldId: field.id,
          availabilityType: "AVAILABLE" as const,
          date: null,
          dayOfWeek,
          startTime,
          endTime: null,
          notes: "9U",
        })),
      ),
    );

    const result = generateSchedule({
      organizationId: "fallball",
      season,
      teams,
      fields,
      availabilities,
      rules: [RULE],
      divisions: ["9U"],
      gamesPerTeam: 2,
    });

    const placed = result.games.filter((game) => game.gameDate && game.fieldId);
    assert.equal(result.errors.length, 0);
    assert.equal(placed.length, 4);
    const byTeam = new Map<string, number>();
    for (const game of placed) {
      byTeam.set(game.homeTeamId, (byTeam.get(game.homeTeamId) ?? 0) + 1);
      byTeam.set(game.awayTeamId, (byTeam.get(game.awayTeamId) ?? 0) + 1);
    }
    for (const team of teams) {
      assert.equal(byTeam.get(team.id), 2);
    }
    const teamNights = new Set<string>();
    for (const game of placed) {
      const day = game.gameDate?.toISOString().slice(0, 10);
      teamNights.add(`${day}:${game.homeTeamId}`);
      teamNights.add(`${day}:${game.awayTeamId}`);
    }
    assert.equal(teamNights.size, 8);
  });

  it("gives an odd division a bye instead of falling back to greedy", () => {
    const season: SchedulerSeason = {
      id: "season",
      organizationId: "fallball",
      seasonYear: 2026,
      name: "Fall",
      startsOn: utcDate(2026, 9, 29),
      endsOn: utcDate(2026, 10, 1),
      defaultGameTimes: ["18:00", "19:15"],
      settings: { gamesPerTeam: 2 },
    };
    const teams: SchedulerTeam[] = ["A", "B", "C"].map((name) => ({
      id: name,
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroup: "15U",
      teamName: name,
    }));
    const fields: SchedulerField[] = [
      {
        id: "f1",
        organizationId: "fallball",
        parkId: "park",
        name: "F1",
        shortName: "F1",
        supportedAgeGroups: ["15U"],
        supportedDivisions: ["15U"],
        isActive: true,
      },
    ];
    const rule: SchedulerDivisionRule = {
      ...RULE,
      id: "rule-15u",
      division: "15U",
      ageGroup: "15U",
    };
    const availabilities: SchedulerAvailability[] = [2, 4].flatMap((dayOfWeek) =>
      ["18:00", "19:15"].map((startTime) => ({
        id: `f1-${dayOfWeek}-${startTime}`,
        organizationId: "fallball",
        seasonId: "season",
        parkId: "park",
        fieldId: "f1",
        availabilityType: "AVAILABLE" as const,
        date: null,
        dayOfWeek,
        startTime,
        endTime: null,
        notes: "15U",
      })),
    );

    const result = generateSchedule({
      organizationId: "fallball",
      season,
      teams,
      fields,
      availabilities,
      rules: [rule],
      divisions: ["15U"],
    });

    const placed = result.games.filter((game) => game.gameDate && game.fieldId);
    assert.equal(placed.length, 2);
    const byDate = new Map<string, number>();
    for (const game of placed) {
      const key = game.gameDate?.toISOString().slice(0, 10) ?? "";
      byDate.set(key, (byDate.get(key) ?? 0) + 1);
    }
    for (const count of byDate.values()) {
      assert.equal(count, 1);
    }
  });
});
