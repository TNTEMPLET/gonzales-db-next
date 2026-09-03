import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isUnallocatedTeamName, playableSchedulerTeams } from "../realTeams";

describe("playableSchedulerTeams", () => {
  it("treats Unallocated as a holding bucket, not a team", () => {
    assert.equal(isUnallocatedTeamName("Unallocated"), true);
    assert.equal(isUnallocatedTeamName(" unallocated "), true);
    assert.equal(isUnallocatedTeamName("Astros - Williams"), false);
  });

  it("drops Unallocated from a division roster", () => {
    const playable = playableSchedulerTeams([
      { id: "1", teamName: "Astros - Williams" },
      { id: "2", teamName: "Unallocated" },
      { id: "3", teamName: "Yankees - Savoia" },
    ]);
    assert.deepEqual(
      playable.map((team) => team.teamName),
      ["Astros - Williams", "Yankees - Savoia"],
    );
  });
});
