import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { earlyLateSkewScore, rebalanceEarlyLateSlots } from "../rebalanceEarlyLate";
import type { GeneratedDraftGame, SchedulerField } from "../types";

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function field(id: string, name: string): SchedulerField {
  return {
    id,
    organizationId: "fallball",
    parkId: "jls",
    name,
    shortName: name,
    supportedAgeGroups: ["7U CP", "8U CP"],
    supportedDivisions: ["6U MOD", "7U CP", "8U CP"],
    isActive: true,
  };
}

function game(params: {
  id: string;
  division: string;
  home: string;
  away: string;
  start: string;
  fieldId: string;
  day?: Date;
}): GeneratedDraftGame {
  const date = params.day ?? utcDate(2026, 10, 6);
  return {
    division: params.division,
    ageGroup: params.division,
    homeTeamId: params.home,
    awayTeamId: params.away,
    homeTeamName: params.home,
    awayTeamName: params.away,
    roundLabel: "R1",
    gameNumber: Number(params.id.replace(/\D/g, "") || 1),
    gameDate: date,
    startTime: params.start,
    endTime: params.start === "18:00" ? "19:15" : "20:30",
    parkId: "jls",
    fieldId: params.fieldId,
    status: "DRAFT",
    sortOrder: 1,
    conflictFlags: [],
    fairnessMetadata: {},
    schedulerNotes: null,
  };
}

const fields = [field("gauthier", "Gauthier"), field("impact", "Impact"), field("velo", "Velo")];

describe("rebalanceEarlyLateSlots", () => {
  it("swaps a 7U early slot with an 8U late slot when that cuts team skew", () => {
    const night1 = utcDate(2026, 10, 6);
    const night2 = utcDate(2026, 10, 8);
    const games = [
      game({ id: "1", division: "7U CP", home: "7A", away: "7B", start: "18:00", fieldId: "velo", day: night1 }),
      game({ id: "2", division: "7U CP", home: "7C", away: "7D", start: "18:00", fieldId: "impact", day: night1 }),
      game({ id: "3", division: "7U CP", home: "7E", away: "7F", start: "19:15", fieldId: "velo", day: night1 }),
      game({ id: "4", division: "8U CP", home: "8Astros", away: "8Rangers", start: "18:00", fieldId: "gauthier", day: night1 }),
      game({ id: "5", division: "8U CP", home: "8Yankees", away: "8Cubs", start: "19:15", fieldId: "gauthier", day: night1 }),
      game({ id: "6", division: "8U CP", home: "8Dodgers", away: "8RedSox", start: "19:15", fieldId: "impact", day: night1 }),
      game({ id: "7", division: "7U CP", home: "7A", away: "7C", start: "18:00", fieldId: "velo", day: night2 }),
      game({ id: "8", division: "7U CP", home: "7B", away: "7D", start: "18:00", fieldId: "impact", day: night2 }),
      game({ id: "9", division: "7U CP", home: "7E", away: "7F", start: "19:15", fieldId: "velo", day: night2 }),
      game({ id: "10", division: "8U CP", home: "8Astros", away: "8Dodgers", start: "18:00", fieldId: "gauthier", day: night2 }),
      game({ id: "11", division: "8U CP", home: "8Yankees", away: "8Rangers", start: "19:15", fieldId: "gauthier", day: night2 }),
      game({ id: "12", division: "8U CP", home: "8Cubs", away: "8RedSox", start: "19:15", fieldId: "impact", day: night2 }),
    ];
    const before = earlyLateSkewScore(games);
    const result = rebalanceEarlyLateSlots({ games, fields });
    const after = earlyLateSkewScore(result.games);
    assert.ok(result.swaps >= 1);
    assert.ok(after.sum < before.sum);
    const yankees = result.games.filter(
      (row) => row.homeTeamId === "8Yankees" || row.awayTeamId === "8Yankees",
    );
    const yankeesEarly = yankees.filter((row) => row.startTime === "18:00").length;
    assert.ok(yankeesEarly >= 1);
  });

  it("does not move a game onto a field that does not support the division", () => {
    const lockedField: SchedulerField = {
      ...field("majors", "Majors"),
      supportedDivisions: ["12U"],
      supportedAgeGroups: ["12U"],
    };
    const games = [
      game({ id: "1", division: "8U CP", home: "8A", away: "8B", start: "18:00", fieldId: "gauthier" }),
      game({ id: "2", division: "12U", home: "12A", away: "12B", start: "19:15", fieldId: "majors" }),
    ];
    const result = rebalanceEarlyLateSlots({ games, fields: [...fields, lockedField] });
    assert.equal(result.swaps, 0);
    assert.equal(result.games[0]?.fieldId, "gauthier");
    assert.equal(result.games[1]?.fieldId, "majors");
  });

  it("keeps matchups and dates; only time/field may change", () => {
    const games = [
      game({ id: "1", division: "8U CP", home: "Yankees", away: "Cubs", start: "19:15", fieldId: "impact" }),
      game({ id: "2", division: "8U CP", home: "Astros", away: "Rangers", start: "18:00", fieldId: "gauthier" }),
    ];
    const result = rebalanceEarlyLateSlots({ games, fields });
    const pairs = result.games.map((row) => `${row.homeTeamId}|${row.awayTeamId}|${row.gameDate?.toISOString()}`).sort();
    const original = games.map((row) => `${row.homeTeamId}|${row.awayTeamId}|${row.gameDate?.toISOString()}`).sort();
    assert.deepEqual(pairs, original);
  });
});
