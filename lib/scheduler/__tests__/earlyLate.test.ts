import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isEarlyStart, projectedEarlyLateCost } from "../earlyLate";

describe("early/late fairness", () => {
  it("treats 17:45 as early and 19:15 as late when those are the two clocks", () => {
    const times = ["17:45", "19:15"];
    assert.equal(isEarlyStart("17:45", times), true);
    assert.equal(isEarlyStart("19:15", times), false);
  });

  it("prefers a late slot when one team is already early-heavy even if the opponent is even", () => {
    const yankeesEarly = 6;
    const yankeesLate = 3;
    const metsEarly = 4;
    const metsLate = 5;
    const takeEarly =
      projectedEarlyLateCost(true, yankeesEarly, yankeesLate) + projectedEarlyLateCost(true, metsEarly, metsLate);
    const takeLate =
      projectedEarlyLateCost(false, yankeesEarly, yankeesLate) + projectedEarlyLateCost(false, metsEarly, metsLate);
    assert.ok(takeLate < takeEarly);
  });
});
