import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defaultScheduleMode, parseScheduleMode } from "../scheduleMode";

describe("scheduleMode", () => {
  it("seeds Tee-ball and 17U as exception modes", () => {
    assert.equal(defaultScheduleMode("4U TB"), "practiceGames");
    assert.equal(defaultScheduleMode("5U TB"), "practiceGames");
    assert.equal(defaultScheduleMode("17U"), "manual");
    assert.equal(defaultScheduleMode("7U CP"), "auto");
    assert.equal(defaultScheduleMode("15U"), "auto");
  });

  it("prefers stored metadata over the seed", () => {
    assert.equal(parseScheduleMode({ scheduleMode: "manual" }, "7U CP"), "manual");
    assert.equal(parseScheduleMode({}, "17U"), "manual");
  });
});
