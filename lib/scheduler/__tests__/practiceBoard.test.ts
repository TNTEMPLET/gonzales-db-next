import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assignmentsFromBoard,
  matchTeamByNickname,
  mlbNickname,
  partnerStartTime,
  rotationNote,
} from "../practiceBoard";
import { formatPracticePlanText } from "../practicePlanText";

describe("practice board", () => {
  it("pairs two teams on one cell and leaves the partner start 45 minutes later", () => {
    const rows = assignmentsFromBoard(
      [
        {
          cycleWeek: 1,
          fieldId: "f3",
          parkId: "jls",
          dayOfWeek: 2,
          startTime: "17:45",
          firstTeamId: "redsox",
          secondTeamId: "yankees",
        },
      ],
      45,
      1,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.pairWithTeamId, "yankees");
    assert.equal(partnerStartTime("17:45", 45), "18:30");
    assert.equal(rows[0]?.notes, null);
  });

  it("labels rotating weeks so Coach Corner can show a 3-week cycle", () => {
    assert.equal(rotationNote(2, 3), "Week 2");
    assert.equal(rotationNote(1, 1), null);
    const text = formatPracticePlanText([
      {
        dayOfWeek: 1,
        startTime: "17:45",
        parkName: "Tee-Joe Gonzales Park",
        fieldName: "Bourque Field",
        pairedTeamName: null,
        isFirst: null,
        notes: "Week 1 of 3",
      },
      {
        dayOfWeek: 3,
        startTime: "19:15",
        parkName: "Tee-Joe Gonzales Park",
        fieldName: "Bourque Field",
        pairedTeamName: "Yankees - Mumphrey",
        isFirst: true,
        notes: "Week 2",
      },
    ]);
    assert.match(text, /^Week 1\n/);
    assert.match(text, /\nWeek 2\n/);
    assert.doesNotMatch(text, /of 3/);
    assert.match(text, /Mondays 5:45 PM/);
    assert.match(text, /you're first/);
  });

  it("matches Athletics and A's as the same nickname", () => {
    assert.equal(mlbNickname("Athletics - Gautreau"), "Athletics");
    assert.equal(mlbNickname("A's - Ludlam"), "Athletics");
    const hit = matchTeamByNickname(
      [
        { teamId: "1", teamName: "Athletics - Gautreau" },
        { teamId: "2", teamName: "Yankees - Viguerie" },
      ],
      "A's",
    );
    assert.equal(hit?.teamId, "1");
  });
});
