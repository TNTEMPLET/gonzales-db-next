import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  centralDateParts,
  compareScheduleFields,
  isBracketDateToday,
  normalizeScheduleField,
  parseBracketDateParts,
  parseBracketTimeSortKey,
} from "@/lib/tournament-brackets/todayScheduleUtils";

describe("todaySchedule", () => {
  it("parses M/D date labels", () => {
    assert.deepEqual(parseBracketDateParts("6/28"), { month: 6, day: 28 });
    assert.deepEqual(parseBracketDateParts("Sun 6/28"), { month: 6, day: 28 });
    assert.equal(parseBracketDateParts("TBD"), null);
  });

  it("matches today in Central Time", () => {
    const now = new Date("2026-06-28T18:00:00.000Z");
    assert.equal(isBracketDateToday("6/28", 2026, now), true);
    assert.equal(isBracketDateToday("6/27", 2026, now), false);
    assert.equal(centralDateParts(now).month, 6);
    assert.equal(centralDateParts(now).day, 28);
  });

  it("sorts fields with F labels first", () => {
    assert.ok(compareScheduleFields("F1", "F3") < 0);
    assert.ok(compareScheduleFields("F3", "Main") < 0);
    assert.ok(compareScheduleFields("Main", "TBD") < 0);
  });

  it("normalizes field labels", () => {
    assert.equal(normalizeScheduleField("F3"), "F3");
    assert.equal(normalizeScheduleField(undefined, "Butch Gore"), "Butch Gore");
    assert.equal(normalizeScheduleField(), "TBD");
  });

  it("sorts times for schedule rows", () => {
    assert.ok(parseBracketTimeSortKey("12:00 PM") < parseBracketTimeSortKey("2:30 PM"));
    assert.equal(parseBracketTimeSortKey("bad"), Number.POSITIVE_INFINITY);
  });
});
