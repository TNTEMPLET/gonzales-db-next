import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_SCHEDULE_REPAIR_STEPS, repairUnplacedGames } from "../generator";
import type { GeneratedDraftGame, SchedulerDivisionRule, SchedulerSlot } from "../types";
import { dateKey } from "../validation";

const RULE: SchedulerDivisionRule = {
  id: "rule-7u",
  organizationId: "fallball",
  seasonId: "season",
  division: "7U CP",
  ageGroup: "7U CP",
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

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function slot(date: Date, startTime: string, fieldId = "f1"): SchedulerSlot {
  return {
    id: `${dateKey(date)}:${fieldId}:${startTime}`,
    date,
    gameDate: dateKey(date),
    startTime,
    endTime: startTime === "18:00" ? "19:15" : "20:30",
    parkId: "park",
    fieldId,
    supportedAgeGroups: ["7U CP"],
    supportedDivisions: ["7U CP"],
  };
}

function game(
  gameNumber: number,
  home: string,
  away: string,
  placed: SchedulerSlot | null,
): GeneratedDraftGame {
  return {
    division: "7U CP",
    ageGroup: "7U CP",
    homeTeamId: home,
    awayTeamId: away,
    homeTeamName: home,
    awayTeamName: away,
    roundLabel: `Round ${gameNumber}`,
    gameNumber,
    gameDate: placed?.date ?? null,
    startTime: placed?.startTime ?? null,
    endTime: placed?.endTime ?? null,
    parkId: placed?.parkId ?? null,
    fieldId: placed?.fieldId ?? null,
    status: placed ? "DRAFT" : "CONFLICT",
    sortOrder: gameNumber,
    conflictFlags: placed ? [] : ["no_available_slot"],
    fairnessMetadata: placed ? { slotId: placed.id } : {},
    schedulerNotes: placed ? null : "unplaced",
  };
}

describe("repairUnplacedGames", () => {
  const week1Tue = utcDate(2026, 9, 29);
  const week1Thu = utcDate(2026, 10, 1);
  const week2Tue = utcDate(2026, 10, 6);
  const slots = [
    slot(week1Tue, "18:00"),
    slot(week1Tue, "19:15"),
    slot(week1Thu, "18:00"),
    slot(week1Thu, "19:15"),
    slot(week2Tue, "18:00"),
    slot(week2Tue, "19:15"),
  ];

  it("places an unassigned game into an open legal slot", () => {
    const games = [
      game(1, "A", "C", slots[0]),
      game(2, "B", "D", slots[1]),
      game(3, "A", "B", null),
    ];
    const repaired = repairUnplacedGames({ games, slots, rules: [RULE] });
    assert.equal(repaired.summary.stopped, "complete");
    assert.equal(repaired.summary.remaining, 0);
    assert.equal(repaired.summary.placed, 1);
    assert.ok(repaired.summary.steps <= MAX_SCHEDULE_REPAIR_STEPS);
    const placed = repaired.games.find((entry) => entry.gameNumber === 3);
    assert.ok(placed?.gameDate);
    assert.equal(placed?.status, "DRAFT");
  });

  it("moves a blocking game so leftover teams can still reach the week cap", () => {
    const week2Thu = utcDate(2026, 10, 8);
    const board = [...slots, slot(week2Thu, "18:00")];
    const games = [
      game(1, "A", "C", board[0]),
      game(2, "B", "D", board[1]),
      game(3, "B", "E", board[2]),
      game(4, "A", "F", board[4]),
      game(5, "A", "G", board[5]),
      game(6, "A", "B", null),
    ];
    const repaired = repairUnplacedGames({ games, slots: board, rules: [RULE] });
    assert.equal(repaired.summary.remaining, 0);
    assert.ok(repaired.summary.moved >= 1);
    assert.ok(repaired.summary.steps <= MAX_SCHEDULE_REPAIR_STEPS);
    const leftover = repaired.games.find((entry) => entry.gameNumber === 6);
    assert.ok(leftover?.gameDate);
    const loads = new Map<string, Map<string, number>>();
    for (const entry of repaired.games) {
      if (!entry.gameDate) continue;
      const week = dateKey(entry.gameDate) <= "2026-10-04" ? "w1" : "w2";
      for (const teamId of [entry.homeTeamId, entry.awayTeamId]) {
        const byWeek = loads.get(teamId) ?? new Map<string, number>();
        byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
        loads.set(teamId, byWeek);
      }
    }
    for (const [teamId, byWeek] of loads) {
      for (const [week, count] of byWeek) {
        assert.ok(count <= 2, `${teamId} has ${count} games in ${week}`);
      }
    }
    const blocker = repaired.games.find((entry) => entry.gameNumber === 3);
    assert.ok(blocker?.gameDate);
    assert.notEqual(dateKey(blocker.gameDate), dateKey(week1Thu));
  });

  it("stops when nothing can move instead of looping", () => {
    const packed = [slots[0], slots[1], slots[2], slots[3], slots[4], slots[5]].map((item, index) =>
      game(index + 1, `H${index}`, `A${index}`, item),
    );
    packed.push(game(99, "A", "B", null));
    const repaired = repairUnplacedGames({ games: packed, slots, rules: [RULE], maxSteps: 8 });
    assert.equal(repaired.summary.remaining, 1);
    assert.ok(repaired.summary.stopped === "no_progress" || repaired.summary.stopped === "cycle");
    assert.ok(repaired.summary.steps <= 8);
    assert.ok(repaired.summary.steps <= MAX_SCHEDULE_REPAIR_STEPS);
  });

  it("honors the step cap", () => {
    const games = [game(1, "A", "C", slots[0]), game(2, "A", "B", null)];
    const repaired = repairUnplacedGames({ games, slots, rules: [RULE], maxSteps: 1 });
    assert.ok(repaired.summary.steps <= 1);
    assert.ok(repaired.summary.maxSteps === 1);
  });
});
