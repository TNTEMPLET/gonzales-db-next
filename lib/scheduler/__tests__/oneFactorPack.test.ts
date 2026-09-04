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

  it("gives Gauthier to 8U when 8U ranked it higher than 7U", () => {
    const season: SchedulerSeason = {
      id: "season",
      organizationId: "fallball",
      seasonYear: 2026,
      name: "Fall",
      startsOn: utcDate(2026, 9, 29),
      endsOn: utcDate(2026, 9, 29),
      defaultGameTimes: ["17:45", "19:15"],
      settings: { gamesPerTeam: 1 },
    };
    const seven: SchedulerTeam[] = ["7A", "7B", "7C", "7D"].map((name) => ({
      id: name,
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroup: "7U CP",
      teamName: name,
    }));
    const eight: SchedulerTeam[] = ["8A", "8B"].map((name) => ({
      id: name,
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroup: "8U CP",
      teamName: name,
    }));
    const fields: SchedulerField[] = [
      {
        id: "gauthier",
        organizationId: "fallball",
        parkId: "jls",
        name: "3 - Gauthier",
        shortName: "3",
        supportedAgeGroups: ["7U CP", "8U CP"],
        supportedDivisions: ["7U CP", "8U CP"],
        isActive: true,
      },
      {
        id: "velo",
        organizationId: "fallball",
        parkId: "jls",
        name: "4 - Velo",
        shortName: "4",
        supportedAgeGroups: ["7U CP", "8U CP"],
        supportedDivisions: ["7U CP", "8U CP"],
        isActive: true,
      },
    ];
    const availabilities: SchedulerAvailability[] = fields.flatMap((field) =>
      ["17:45", "19:15"].map((startTime) => ({
        id: `${field.id}-${startTime}`,
        organizationId: "fallball",
        seasonId: "season",
        parkId: "jls",
        fieldId: field.id,
        availabilityType: "AVAILABLE" as const,
        date: null,
        dayOfWeek: 2,
        startTime,
        endTime: null,
        notes: "7U CP, 8U CP",
      })),
    );
    const rule7: SchedulerDivisionRule = {
      ...RULE,
      id: "rule-7u",
      division: "7U CP",
      ageGroup: "7U CP",
      ruleMetadata: { allowDoubleHeaders: false },
    };
    const rule8: SchedulerDivisionRule = {
      ...RULE,
      id: "rule-8u",
      division: "8U CP",
      ageGroup: "8U CP",
      ruleMetadata: { allowDoubleHeaders: false, fieldPriorityIds: ["gauthier", "velo"] },
    };

    const result = generateSchedule({
      organizationId: "fallball",
      season,
      teams: [...seven, ...eight],
      fields,
      availabilities,
      rules: [rule7, rule8],
      divisions: ["7U CP", "8U CP"],
    });

    const eightGames = result.games.filter((game) => game.division === "8U CP" && game.fieldId);
    const sevenOnGauthier = result.games.filter(
      (game) => game.division === "7U CP" && game.fieldId === "gauthier",
    );
    assert.equal(eightGames.length, 1);
    assert.equal(eightGames[0]?.fieldId, "gauthier");
    assert.equal(sevenOnGauthier.length, 0);
  });
});
