import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertScheduledForMatchesGcForm,
  expectedUtcFromGcForm,
  parseGcFormDateParts,
  parseGcFormTimeParts,
} from "./gcScheduleTime.js";

describe("expectedUtcFromGcForm", () => {
  it("maps noon Central form entry to 17:00 UTC", () => {
    assert.equal(expectedUtcFromGcForm("06/28/26", "12:00 PM"), "2026-06-28T17:00:00.000Z");
  });

  it("maps 5:00 PM Central to 22:00 UTC", () => {
    assert.equal(expectedUtcFromGcForm("06/28/26", "5:00 PM"), "2026-06-28T22:00:00.000Z");
  });
});

describe("assertScheduledForMatchesGcForm", () => {
  it("accepts matching scheduledFor", () => {
    assertScheduledForMatchesGcForm(
      "2026-06-28T17:00:00.000Z",
      "06/28/26",
      "12:00 PM",
    );
  });

  it("rejects mismatched scheduledFor", () => {
    assert.throws(() => {
      assertScheduledForMatchesGcForm(
        "2026-06-28T12:00:00.000Z",
        "06/28/26",
        "12:00 PM",
      );
    }, /scheduledFor does not match/);
  });
});

describe("parseGcFormDateParts", () => {
  it("parses MM/DD/YY", () => {
    assert.deepEqual(parseGcFormDateParts("06/28/26"), { year: 2026, month: 6, day: 28 });
  });
});

describe("parseGcFormTimeParts", () => {
  it("parses 12-hour clock", () => {
    assert.deepEqual(parseGcFormTimeParts("2:30 PM"), { hours24: 14, minutes: 30 });
  });
});
