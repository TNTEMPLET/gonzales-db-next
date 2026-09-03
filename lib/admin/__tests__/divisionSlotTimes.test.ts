import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  laterStartDivisions,
  parseDivisionSlotTimes,
  resolveDivisionSlotTime,
  withSuggestedDivisionTimes,
} from "../divisionSlotTimes";

describe("division slot times", () => {
  it("reads overrides from season settings", () => {
    const parsed = parseDivisionSlotTimes({
      divisionSlotTimes: {
        "7U CP": ["18:00", "19:15"],
        "8U CP": ["18:00", "19:15"],
      },
    });
    assert.deepEqual(parsed["7U CP"], ["18:00", "19:15"]);
  });

  it("uses the division override when a 7U/8U cell is filled", () => {
    const overrides = { "7U CP": ["18:00", "19:15"] as [string, string] };
    assert.equal(resolveDivisionSlotTime("7U CP", 0, "17:45", overrides), "18:00");
    assert.equal(resolveDivisionSlotTime("10U", 0, "17:45", overrides), "17:45");
    assert.equal(resolveDivisionSlotTime("", 0, "17:45", overrides), "17:45");
  });

  it("suggests 6U Modified with 7U and 8U for Fall Ball", () => {
    assert.deepEqual(laterStartDivisions("fallball"), ["6U MOD", "7U CP", "8U CP"]);
    const merged = withSuggestedDivisionTimes(
      [{ division: "7U CP", slot1: "18:00", slot2: "19:15" }],
      "fallball",
      ["17:45", "18:00", "19:15"],
    );
    assert.equal(merged.length, 3);
    assert.equal(merged.find((row) => row.division === "6U MOD")?.slot1, "18:00");
    assert.equal(merged.find((row) => row.division === "7U CP")?.slot1, "18:00");
  });
});
