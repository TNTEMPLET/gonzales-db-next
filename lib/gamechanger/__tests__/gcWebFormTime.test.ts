import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bracketScheduleToUtcInstant,
  gcWebFormScheduleFromBracketLabels,
  gcWebFormScheduleFromInstant,
} from "@/lib/gamechanger/schedule-manager/gcWebFormTime";

describe("gcWebFormScheduleFromInstant", () => {
  it("maps 5:00 PM CDT on 6/27 to local form entry 5:00 PM", () => {
    const instant = new Date("2026-06-27T22:00:00.000Z");
    const form = gcWebFormScheduleFromInstant(instant);
    assert.equal(form.gcFormDate, "06/27/26");
    assert.equal(form.gcFormTime, "5:00 PM");
  });

  it("maps 12:00 PM CDT on 6/28 to local form entry 12:00 PM", () => {
    const instant = new Date("2026-06-28T17:00:00.000Z");
    const form = gcWebFormScheduleFromInstant(instant);
    assert.equal(form.gcFormDate, "06/28/26");
    assert.equal(form.gcFormTime, "12:00 PM");
  });

  it("maps 7:30 PM CDT on 6/26 to local form entry on 6/26", () => {
    const instant = new Date("2026-06-27T00:30:00.000Z");
    const form = gcWebFormScheduleFromInstant(instant);
    assert.equal(form.gcFormDate, "06/26/26");
    assert.equal(form.gcFormTime, "7:30 PM");
  });
});

describe("gcWebFormScheduleFromBracketLabels", () => {
  it("passes bracket local labels through to the GC form", () => {
    const form = gcWebFormScheduleFromBracketLabels("6/27", "5:00 PM", 2026);
    assert.ok(form);
    assert.equal(form!.gcFormDate, "06/27/26");
    assert.equal(form!.gcFormTime, "5:00 PM");
  });

  it("maps lowercase compact times like 12:00pm", () => {
    const form = gcWebFormScheduleFromBracketLabels("6/28", "12:00pm", 2026);
    assert.ok(form);
    assert.equal(form!.gcFormDate, "06/28/26");
    assert.equal(form!.gcFormTime, "12:00 PM");
  });

  it("still derives the correct UTC instant for scoreboard matching", () => {
    const instant = bracketScheduleToUtcInstant("6/28", "12:00pm", 2026);
    assert.ok(instant);
    assert.equal(instant!.toISOString(), "2026-06-28T17:00:00.000Z");
  });
});
