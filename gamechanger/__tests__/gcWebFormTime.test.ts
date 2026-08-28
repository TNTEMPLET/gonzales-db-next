import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bracketScheduleToUtcInstant,
  gcWebFormScheduleFromBracketLabels,
  gcWebFormScheduleFromInstant,
} from "@/lib/gamechanger/schedule-manager/gcWebFormTime";

describe("gcWebFormScheduleFromInstant", () => {
  it("maps 12:00 PM CDT to form entry 12:00 PM (writer uses America/Chicago)", () => {
    const instant = new Date("2026-06-28T17:00:00.000Z");
    const form = gcWebFormScheduleFromInstant(instant);
    assert.equal(form.gcFormDate, "06/28/26");
    assert.equal(form.gcFormTime, "12:00 PM");
  });

  it("maps 5:00 PM CDT on 6/27 to form entry 5:00 PM", () => {
    const instant = new Date("2026-06-27T22:00:00.000Z");
    const form = gcWebFormScheduleFromInstant(instant);
    assert.equal(form.gcFormDate, "06/27/26");
    assert.equal(form.gcFormTime, "5:00 PM");
  });
});

describe("gcWebFormScheduleFromBracketLabels", () => {
  it("passes bracket Central labels through for the writer form", () => {
    const form = gcWebFormScheduleFromBracketLabels("6/28", "12:00pm", 2026);
    assert.ok(form);
    assert.equal(form!.gcFormDate, "06/28/26");
    assert.equal(form!.gcFormTime, "12:00 PM");
  });

  it("normalizes compact times like 2:30pm", () => {
    const form = gcWebFormScheduleFromBracketLabels("6/28", "2:30pm", 2026);
    assert.ok(form);
    assert.equal(form!.gcFormTime, "2:30 PM");
  });

  it("derives true Central UTC for scoreboard lookup", () => {
    const instant = bracketScheduleToUtcInstant("6/28", "12:00pm", 2026);
    assert.ok(instant);
    assert.equal(instant!.toISOString(), "2026-06-28T17:00:00.000Z");
  });

  it("maps 3:00pm Central to 20:00 UTC", () => {
    const instant = bracketScheduleToUtcInstant("6/28", "3:00pm", 2026);
    assert.equal(instant!.toISOString(), "2026-06-28T20:00:00.000Z");
  });
});
