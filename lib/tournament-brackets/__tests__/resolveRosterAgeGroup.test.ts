import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveRosterAgeGroup } from "@/lib/tournament-brackets/resolveRosterAgeGroup";

describe("resolveRosterAgeGroup", () => {
  it("prefers explicit rosterAgeGroup when it exists in the roster", () => {
    const result = resolveRosterAgeGroup(["10U", "12U Majors"], {
      rosterAgeGroup: "12U Majors",
      championAgeGroupLabel: "10U",
      divisionLabel: "8U",
    });
    assert.equal(result, "12U Majors");
  });

  it("matches champion label to a roster key", () => {
    const result = resolveRosterAgeGroup(["10U", "12U Majors"], {
      championAgeGroupLabel: "12U",
      divisionLabel: "Tournament",
    });
    assert.equal(result, "12U Majors");
  });

  it("parses age from division title when needed", () => {
    const result = resolveRosterAgeGroup(["12U Majors"], {
      divisionLabel: "Spring 12U bracket",
    });
    assert.equal(result, "12U Majors");
  });
});
