import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fillExtraGames } from "../fillExtraGames";
import { generateThreeTeamDoubleheaders } from "../threeTeamDoubleheaders";
import type {
  GeneratedDraftGame,
  SchedulerAvailability,
  SchedulerDivisionRule,
  SchedulerField,
  SchedulerSeason,
  SchedulerTeam,
} from "../types";

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function teamCounts(games: GeneratedDraftGame[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const game of games) {
    if (!game.gameDate) continue;
    counts.set(game.homeTeamId, (counts.get(game.homeTeamId) ?? 0) + 1);
    counts.set(game.awayTeamId, (counts.get(game.awayTeamId) ?? 0) + 1);
  }
  return counts;
}

function fixture() {
  const season: SchedulerSeason = {
    id: "season",
    organizationId: "fallball",
    seasonYear: 2026,
    name: "Fall",
    startsOn: utcDate(2026, 9, 28),
    endsOn: utcDate(2026, 11, 30),
    defaultGameTimes: ["17:45", "19:15"],
    settings: { gamesPerTeam: 10, gamesStartsOn: "2026-09-28", gamesEndsOn: "2026-11-30" },
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
  const generated = generateThreeTeamDoubleheaders({
    organizationId: "fallball",
    season,
    teams,
    fields,
    availabilities,
    rules: [rule],
    divisions: ["17U"],
  });
  const existing = generated.games.filter((game) => game.gameDate && game.startTime);
  return { season, teams, fields, availabilities, rule, existing };
}

describe("fillExtraGames", () => {
  it("adds DH nights after the last existing 17U game through a later date", () => {
    const { season, teams, fields, availabilities, rule, existing } = fixture();
    const lastExisting = [...existing]
      .map((game) => game.gameDate!.toISOString().slice(0, 10))
      .sort()
      .at(-1)!;
    const filled = fillExtraGames({
      organizationId: "fallball",
      season,
      teams,
      fields,
      availabilities,
      rules: [rule],
      divisions: ["17U"],
      existingGames: existing,
      fillEndsOn: "2026-11-30",
    });
    const added = filled.games.filter((game) => game.gameDate && game.startTime);
    assert.ok(added.length >= 2);
    for (const game of added) {
      assert.ok(game.gameDate!.toISOString().slice(0, 10) > lastExisting);
    }
    const existingKeys = existing.map((game) => `${game.gameDate!.toISOString()}|${game.startTime}|${game.homeTeamId}`);
    for (const key of existingKeys) {
      assert.equal(existingKeys.filter((item) => item === key).length, 1);
    }
    assert.equal(existing.length, fixture().existing.length);
  });

  it("adds at least +4 games per team when extra is set", () => {
    const { season, teams, fields, availabilities, rule, existing } = fixture();
    const before = teamCounts(existing);
    const filled = fillExtraGames({
      organizationId: "fallball",
      season,
      teams,
      fields,
      availabilities,
      rules: [rule],
      divisions: ["17U"],
      existingGames: existing,
      extraGamesPerTeam: 4,
    });
    const after = teamCounts([...existing, ...filled.games]);
    for (const team of teams) {
      const gained = (after.get(team.id) ?? 0) - (before.get(team.id) ?? 0);
      assert.ok(gained >= 4, `${team.id} gained ${gained}`);
    }
  });

  it("stops at the earlier of date window and extra-game target", () => {
    const { season, teams, fields, availabilities, rule, existing } = fixture();
    const lastExisting = [...existing]
      .map((game) => game.gameDate!.toISOString().slice(0, 10))
      .sort()
      .at(-1)!;
    const filled = fillExtraGames({
      organizationId: "fallball",
      season,
      teams,
      fields,
      availabilities,
      rules: [rule],
      divisions: ["17U"],
      existingGames: existing,
      fillStartsOn: lastExisting,
      fillEndsOn: lastExisting,
      extraGamesPerTeam: 20,
    });
    assert.equal(filled.games.filter((game) => game.gameDate).length, 0);
  });

  it("does not double-book an occupied slot", () => {
    const { season, teams, fields, availabilities, rule, existing } = fixture();
    const last = [...existing].sort((a, b) => a.gameDate!.toISOString().localeCompare(b.gameDate!.toISOString())).at(-1)!;
    const nextMonday = new Date(last.gameDate!);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + ((8 - nextMonday.getUTCDay()) % 7 || 7));
    const blocker: GeneratedDraftGame = {
      ...last,
      division: "15U",
      ageGroup: "15U",
      gameDate: nextMonday,
      startTime: "17:45",
      endTime: "19:15",
      fieldId: "velo",
      homeTeamId: "other-home",
      awayTeamId: "other-away",
      gameNumber: 999,
    };
    const filled = fillExtraGames({
      organizationId: "fallball",
      season,
      teams,
      fields,
      availabilities,
      rules: [rule],
      divisions: ["17U"],
      existingGames: [...existing, blocker],
      extraGamesPerTeam: 4,
    });
    for (const game of filled.games) {
      const sameSlot =
        game.fieldId === "velo" &&
        game.gameDate?.toISOString().slice(0, 10) === nextMonday.toISOString().slice(0, 10) &&
        game.startTime === "17:45";
      assert.equal(sameSlot, false);
    }
  });
});
