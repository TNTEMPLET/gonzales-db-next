import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSchedulerSlots } from "../generator";
import type { SchedulerAvailability, SchedulerField, SchedulerSeason } from "../types";

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe("shared division slots", () => {
  it("lets 7U and 8U both use a weekly field night tagged in notes", () => {
    const season: SchedulerSeason = {
      id: "season",
      organizationId: "fallball",
      seasonYear: 2026,
      name: "Fall",
      startsOn: utcDate(2026, 9, 1),
      endsOn: utcDate(2026, 9, 3),
      defaultGameTimes: ["18:00", "19:15"],
    };
    const fields: SchedulerField[] = [
      {
        id: "f1",
        organizationId: "fallball",
        parkId: "park",
        name: "Field 1",
        shortName: "F1",
        supportedAgeGroups: [],
        supportedDivisions: [],
        isActive: true,
      },
    ];
    const availabilities: SchedulerAvailability[] = [
      {
        id: "a1",
        organizationId: "fallball",
        seasonId: "season",
        parkId: "park",
        fieldId: "f1",
        availabilityType: "AVAILABLE",
        date: null,
        dayOfWeek: 2,
        startTime: "18:00",
        endTime: null,
        notes: "7U CP, 8U CP",
      },
    ];

    const slots = buildSchedulerSlots({ season, fields, availabilities });
    assert.ok(slots.length >= 1);
    assert.deepEqual(slots[0]?.supportedDivisions, ["7U CP", "8U CP"]);
    assert.deepEqual(slots[0]?.supportedAgeGroups, ["7U CP", "8U CP"]);
  });
});
