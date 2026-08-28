import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  candidateNamesForMapping,
  suggestTeamLabelMappings,
} from "@/lib/tournament-brackets/suggestTeamLabelMappings";

describe("suggestTeamLabelMappings", () => {
  it("suggests rename when normalized names match", () => {
    const suggested = suggestTeamLabelMappings(["TEAM A", "lightning bolts"], ["Team A", "Lightning Bolts"]);
    assert.deepEqual(suggested, [
      { from: "TEAM A", to: "Team A" },
      { from: "lightning bolts", to: "Lightning Bolts" },
    ]);
  });

  it("dedupes candidates from GC and roster", () => {
    const names = candidateNamesForMapping(
      ["Team A", "Team B"],
      ["Team A", "Team C"],
    );
    assert.deepEqual(names, ["Team A", "Team B", "Team C"]);
  });
});
