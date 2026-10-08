import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ASSIGNR_MAX_PAGE_LIMIT, assignrPageLimit } from "@/lib/assignr/pageLimit";

describe("assignr page limit", () => {
  it("caps a page at 50 so Assignr accepts it", () => {
    assert.equal(ASSIGNR_MAX_PAGE_LIMIT, 50);
    assert.equal(assignrPageLimit(100), 50);
    assert.equal(assignrPageLimit(51), 50);
    assert.equal(assignrPageLimit(50), 50);
    assert.equal(assignrPageLimit(1), 1);
    assert.equal(assignrPageLimit(undefined), 50);
    assert.equal(assignrPageLimit(0), 50);
    assert.equal(assignrPageLimit(Number.NaN), 50);
  });
});
