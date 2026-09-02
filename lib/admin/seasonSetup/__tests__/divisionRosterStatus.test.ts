import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyDivisionRosterBuild } from "../divisionRosterStatus";

describe("classifyDivisionRosterBuild", () => {
  it("credits a materialized or completed draft even if real teams already exist", () => {
    const teams = [
      { teamName: "Astros", playerCount: 12 },
      { teamName: "Unallocated", playerCount: 0 },
    ];
    const materialized = classifyDivisionRosterBuild({
      ageGroup: "10U",
      teams,
      draftStatus: "MATERIALIZED",
    });
    assert.equal(materialized.method, "DRAFT");
    assert.equal(materialized.status, "COMPLETE");
    assert.equal(materialized.href, "/admin/draft");

    const completed = classifyDivisionRosterBuild({
      ageGroup: "10U",
      teams,
      draftStatus: "COMPLETED",
    });
    assert.equal(completed.method, "DRAFT");
    assert.equal(completed.status, "COMPLETE");
  });

  it("treats an open draft session as in-progress, not a direct import", () => {
    const result = classifyDivisionRosterBuild({
      ageGroup: "12U",
      teams: [
        { teamName: "Yankees", playerCount: 0 },
        { teamName: "Unallocated", playerCount: 40 },
      ],
      draftStatus: "LIVE",
    });
    assert.equal(result.method, "DRAFT");
    assert.equal(result.status, "INCOMPLETE");
    assert.equal(result.href, "/admin/draft");
  });

  it("marks direct import complete when real teams have players and Unallocated is empty", () => {
    const result = classifyDivisionRosterBuild({
      ageGroup: "6U MOD",
      teams: [
        { teamName: "Cubs", playerCount: 8 },
        { teamName: "Unallocated", playerCount: 0 },
      ],
      draftStatus: null,
    });
    assert.equal(result.method, "DIRECT_IMPORT");
    assert.equal(result.status, "COMPLETE");
    assert.equal(result.href, "/admin/teams");
    assert.equal(result.methodLabel, "Direct import");
  });

  it("keeps direct import incomplete while Unallocated still has players", () => {
    const result = classifyDivisionRosterBuild({
      ageGroup: "4U TB",
      teams: [
        { teamName: "Reds", playerCount: 6 },
        { teamName: "Unallocated", playerCount: 3 },
      ],
      draftStatus: undefined,
    });
    assert.equal(result.method, "DIRECT_IMPORT");
    assert.equal(result.status, "INCOMPLETE");
  });

  it("is not started when only Unallocated exists or real teams are empty", () => {
    const unallocatedOnly = classifyDivisionRosterBuild({
      ageGroup: "15U",
      teams: [{ teamName: "Unallocated", playerCount: 20 }],
      draftStatus: null,
    });
    assert.equal(unallocatedOnly.method, null);
    assert.equal(unallocatedOnly.status, "INCOMPLETE");

    const emptyRealTeams = classifyDivisionRosterBuild({
      ageGroup: "17U",
      teams: [{ teamName: "Dodgers", playerCount: 0 }],
      draftStatus: null,
    });
    assert.equal(emptyRealTeams.method, null);
    assert.equal(emptyRealTeams.status, "INCOMPLETE");
  });
});
