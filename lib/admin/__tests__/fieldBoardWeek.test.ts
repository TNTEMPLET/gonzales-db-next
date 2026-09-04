import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  divisionsUsedInWeek,
  emptyFieldWeek,
  parseCellDivisions,
  parseFieldWeek,
  resolveSharedSlotTime,
  serializeCellDivisions,
  toggleCellDivision,
  weekDivisionsFromMeta,
} from "../fieldBoardWeek";

describe("field board week cells", () => {
  it("reads a legacy single-division string", () => {
    assert.deepEqual(parseCellDivisions("7U CP"), ["7U CP"]);
  });

  it("reads comma-separated notes the generator already understands", () => {
    assert.deepEqual(parseCellDivisions("7U CP, 8U CP"), ["7U CP", "8U CP"]);
    assert.deepEqual(parseCellDivisions(["7U CP", "8U CP"]), ["7U CP", "8U CP"]);
    assert.deepEqual(parseCellDivisions(["7U CP, 8U CP"]), ["7U CP", "8U CP"]);
  });

  it("round-trips a shared 7U/8U cell into availability notes", () => {
    assert.equal(serializeCellDivisions(["7U CP", "8U CP"]), "7U CP, 8U CP");
    assert.equal(serializeCellDivisions([]), null);
  });

  it("toggles a division on a cell without dropping the other", () => {
    assert.deepEqual(toggleCellDivision(["7U CP"], "8U CP"), ["7U CP", "8U CP"]);
    assert.deepEqual(toggleCellDivision(["7U CP", "8U CP"], "7U CP"), ["8U CP"]);
  });

  it("loads old week metadata that stored one string per slot", () => {
    const week = parseFieldWeek({
      "2": ["7U CP", "8U CP"],
      "4": ["7U CP", ""],
    });
    assert.deepEqual(week[2], [["7U CP"], ["8U CP"]]);
    assert.deepEqual(week[4], [["7U CP"], []]);
    assert.deepEqual(week[1], [[], []]);
  });

  it("loads new week metadata that stores a list per slot", () => {
    const week = parseFieldWeek({
      "2": [
        ["7U CP", "8U CP"],
        ["7U CP", "8U CP"],
      ],
    });
    assert.deepEqual(week[2][0], ["7U CP", "8U CP"]);
    assert.deepEqual(divisionsUsedInWeek(week), ["7U CP", "8U CP"]);
    assert.deepEqual(
      weekDivisionsFromMeta({
        week: { "2": [["7U CP", "8U CP"], "10U"] },
      }).sort(),
      ["10U", "7U CP", "8U CP"],
    );
  });

  it("uses one start time when 7U and 8U share a later-start override", () => {
    const overrides = {
      "7U CP": ["18:00", "19:15"] as [string, string],
      "8U CP": ["18:00", "19:15"] as [string, string],
    };
    const resolved = resolveSharedSlotTime(["7U CP", "8U CP"], 0, "17:45", overrides);
    assert.equal(resolved.time, "18:00");
    assert.equal(resolved.conflict, false);
  });

  it("flags a shared cell when the selected divisions use different clocks", () => {
    const overrides = {
      "7U CP": ["18:00", "19:15"] as [string, string],
    };
    const resolved = resolveSharedSlotTime(["7U CP", "10U"], 0, "17:45", overrides);
    assert.equal(resolved.time, "18:00");
    assert.equal(resolved.conflict, true);
    assert.deepEqual(resolved.conflictDivisions, ["10U"]);
  });

  it("starts from an empty week with no phantom divisions", () => {
    assert.deepEqual(divisionsUsedInWeek(emptyFieldWeek()), []);
  });
});
