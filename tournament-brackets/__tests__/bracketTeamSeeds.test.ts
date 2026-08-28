import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampSeedNumber,
  reorderTeamToSeed,
  teamNamesInSeedOrder,
  teamNamesToSeedEntries,
} from "@/lib/tournament-brackets/bracketTeamSeeds";

describe("bracketTeamSeeds", () => {
  it("maps ordered names to 1-based seeds", () => {
    assert.deepEqual(teamNamesToSeedEntries(["A", "B", "C"]), [
      { teamName: "A", seed: 1 },
      { teamName: "B", seed: 2 },
      { teamName: "C", seed: 3 },
    ]);
  });

  it("reorders a team to a new seed slot", () => {
    const next = reorderTeamToSeed(["A", "B", "C", "D"], "D", 2);
    assert.deepEqual(next, ["A", "D", "B", "C"]);
  });

  it("clamps seed numbers to the team count", () => {
    assert.equal(clampSeedNumber(0, 5), 1);
    assert.equal(clampSeedNumber(99, 5), 5);
  });

  it("sorts entries by seed for bracket team list", () => {
    const ordered = teamNamesInSeedOrder([
      { teamName: "C", seed: 3 },
      { teamName: "A", seed: 1 },
      { teamName: "B", seed: 2 },
    ]);
    assert.deepEqual(ordered, ["A", "B", "C"]);
  });
});
