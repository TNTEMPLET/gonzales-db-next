import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TEEBALL_GAMES, TEEBALL_PRACTICE } from "../fixtures/fallball-2026-teeball";
import { fieldNumberFromName, findTeamByMascot, teamMascotKey } from "../teeballMascot";

describe("teeball mascot map", () => {
  it("maps A's to Athletics roster names", () => {
    assert.equal(teamMascotKey("Athletics - Lebouef"), "athletics");
    const team = findTeamByMascot([{ teamName: "Athletics - Lebouef" }, { teamName: "Yankees - Francis" }], "A's");
    assert.equal(team?.teamName, "Athletics - Lebouef");
  });

  it("reads field numbers from leading digits and Field N labels", () => {
    assert.equal(fieldNumberFromName("4 - Velo"), 4);
    assert.equal(fieldNumberFromName("1"), 1);
    assert.equal(fieldNumberFromName("Field 4"), 4);
    assert.equal(fieldNumberFromName("Field 1"), 1);
  });
});

describe("fall 2026 tee-ball fixture", () => {
  it("has 4U three games every weekday and 5U skipping Tuesday field 1", () => {
    const four = TEEBALL_GAMES.filter((row) => row.ageGroup === "4U TB");
    const five = TEEBALL_GAMES.filter((row) => row.ageGroup === "5U TB");
    const fourByDate = new Map<string, typeof four>();
    for (const row of four) {
      const list = fourByDate.get(row.date) ?? [];
      list.push(row);
      fourByDate.set(row.date, list);
    }
    for (const rows of fourByDate.values()) assert.equal(rows.length, 3);
    assert.equal(four.filter((row) => row.date === "2026-09-30" && row.fieldNumber === 4 && row.home === "Padres" && row.away === "Yankees").length, 1);
    assert.equal(five.filter((row) => row.date === "2026-10-07" && row.fieldNumber === 1 && row.home === "Red Sox" && row.away === "Phillies").length, 1);
    assert.equal(five.filter((row) => row.date === "2026-10-06" && row.fieldNumber === 1).length, 0);
    assert.equal(five.filter((row) => row.date.startsWith("2026-10-06")).length, 2);
  });

  it("encodes practice pairs for both night groups", () => {
    assert.equal(TEEBALL_PRACTICE.filter((row) => row.ageGroup === "4U TB").length, 6);
    assert.equal(TEEBALL_PRACTICE.filter((row) => row.ageGroup === "5U TB" && row.days === "TTh").length, 2);
  });
});
