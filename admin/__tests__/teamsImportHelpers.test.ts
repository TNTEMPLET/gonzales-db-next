import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTeamNameFromSponsor,
  getImportProgressPercent,
  getImportRowValue,
  getTeamsManagementAgeGroupDefaults,
  mergeTeamsManagementAgeGroupOptions,
  normalizeLooseName,
  shouldSkipDivisionImport,
  sortTeamsManagementAgeGroups,
} from "../teamsImportHelpers";

describe("teamsImportHelpers", () => {
  it("reads first non-empty import column", () => {
    assert.equal(
      getImportRowValue({ Team: "  Aces  ", "Team Name": "Skip" }, [
        "Team Name",
        "Team",
      ]),
      "Skip",
    );
    assert.equal(
      getImportRowValue({ Team: "Aces" }, ["Team Name", "Team"]),
      "Aces",
    );
  });

  it("computes import progress percent", () => {
    assert.equal(getImportProgressPercent(null), 0);
    assert.equal(
      getImportProgressPercent({ totalRows: 10, processedRows: 5 }),
      50,
    );
    assert.equal(
      getImportProgressPercent({ totalRows: 0, processedRows: 0 }),
      0,
    );
  });

  it("normalizes loose names", () => {
    assert.equal(normalizeLooseName("  Foo--Bar  "), "foo bar");
  });

  it("skips only umpire divisions; SportsConnect is source of truth", () => {
    assert.equal(shouldSkipDivisionImport("Umpire Clinic"), true);
    assert.equal(shouldSkipDivisionImport("Volunteer Umpire"), true);
    assert.equal(shouldSkipDivisionImport("Little League Tee Ball"), false);
    assert.equal(shouldSkipDivisionImport("Modified Tee Ball"), false);
    assert.equal(shouldSkipDivisionImport("5 Year-Old"), false);
    assert.equal(shouldSkipDivisionImport("5 Year Olds Baseball"), false);
    assert.equal(shouldSkipDivisionImport("3-4 Year-Old"), false);
    assert.equal(shouldSkipDivisionImport("3/4 Year-Old Tball"), false);
    assert.equal(shouldSkipDivisionImport("Tee Ball, 3-4 year-olds"), false);
    assert.equal(shouldSkipDivisionImport("Tee Ball, 5 year-olds"), false);
    assert.equal(shouldSkipDivisionImport("10U DYB"), false);
    assert.equal(shouldSkipDivisionImport("15 Year-Old"), false);
    assert.equal(shouldSkipDivisionImport("15 Year Olds"), false);
    assert.equal(shouldSkipDivisionImport("10 Year-Old"), false);
    assert.equal(shouldSkipDivisionImport("6 Year-Old"), false);
    assert.equal(shouldSkipDivisionImport("8U DYB"), false);
  });

  it("builds sponsor team names", () => {
    assert.equal(buildTeamNameFromSponsor("Acme", "Smith"), "Acme - Smith");
    assert.equal(buildTeamNameFromSponsor("", "Smith"), "");
  });

  it("defaults age groups per org", () => {
    assert.ok(
      getTeamsManagementAgeGroupDefaults("fallball").some((v) =>
        v.includes("Fall"),
      ),
    );
    assert.ok(
      getTeamsManagementAgeGroupDefaults("ascension").some((v) =>
        v.includes("LLB"),
      ),
    );
    assert.ok(
      getTeamsManagementAgeGroupDefaults("gonzales").some((v) =>
        v.includes("DYB"),
      ),
    );
  });

  it("sorts and merges age group options", () => {
    const merged = mergeTeamsManagementAgeGroupOptions(
      ["10U DYB", "8U DYB"],
      ["12U DYB", "8U DYB"],
    );
    assert.deepEqual(
      merged.map((v) => v.split(" ")[0]),
      ["8U", "10U", "12U"],
    );
    assert.ok(sortTeamsManagementAgeGroups("8U", "10U") < 0);
  });
});
