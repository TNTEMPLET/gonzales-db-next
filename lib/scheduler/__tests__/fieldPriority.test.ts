import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  claimedFieldOwner,
  fieldClaimsForNight,
  fieldPriorityRank,
  fieldsClaimedByOthers,
  parseFieldPriorityIds,
} from "../fieldPriority";

describe("field priority", () => {
  it("reads an ordered field list from rule metadata", () => {
    assert.deepEqual(parseFieldPriorityIds({ fieldPriorityIds: ["f3", "f4", "f3", ""] }), ["f3", "f4"]);
    assert.deepEqual(parseFieldPriorityIds({}), []);
  });

  it("ranks listed fields ahead of unlisted ones", () => {
    assert.equal(fieldPriorityRank("f3", ["f3", "f4"]), 0);
    assert.equal(fieldPriorityRank("f4", ["f3", "f4"]), 1);
    assert.equal(fieldPriorityRank("f5", ["f3", "f4"]), Number.POSITIVE_INFINITY);
  });

  it("gives a shared field to the division that ranked it higher", () => {
    const claimants = [
      { division: "7U CP", pairsNeeded: 5, priorityIds: ["f4", "f3"] },
      { division: "8U CP", pairsNeeded: 3, priorityIds: ["f3", "f4"] },
    ];
    assert.equal(claimedFieldOwner("f3", claimants), "8U CP");
    assert.equal(claimedFieldOwner("f4", claimants), "7U CP");
    assert.equal(claimedFieldOwner("f5", claimants), null);
  });

  it("does not lock later list fields just because one division named them", () => {
    const claimants = [
      { division: "7U CP", pairsNeeded: 2, priorityIds: [] },
      { division: "8U CP", pairsNeeded: 1, priorityIds: ["f3", "f4"] },
    ];
    assert.equal(claimedFieldOwner("f3", claimants), "8U CP");
    assert.equal(claimedFieldOwner("f4", claimants), null);
  });

  it("breaks a same-rank tie toward the division that needs more games", () => {
    const claimants = [
      { division: "8U CP", pairsNeeded: 3, priorityIds: ["f3"] },
      { division: "7U CP", pairsNeeded: 5, priorityIds: ["f3"] },
    ];
    assert.equal(claimedFieldOwner("f3", claimants), "7U CP");
  });

  it("blocks a division from fields claimed by someone else", () => {
    const claims = fieldClaimsForNight(
      ["f3", "f4", "f5"],
      [
        { division: "7U CP", pairsNeeded: 5, priorityIds: ["f4"] },
        { division: "8U CP", pairsNeeded: 3, priorityIds: ["f3"] },
      ],
    );
    assert.equal(claims.get("f3"), "8U CP");
    assert.equal(claims.get("f4"), "7U CP");
    assert.equal(claims.has("f5"), false);
    assert.deepEqual([...fieldsClaimedByOthers("7U CP", claims)].sort(), ["f3"]);
    assert.deepEqual([...fieldsClaimedByOthers("8U CP", claims)].sort(), ["f4"]);
  });
});
