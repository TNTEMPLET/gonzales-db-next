import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coachDisplayName, formatUploadedAt } from "../display";

describe("coachCorner display", () => {
  it("formats coach names", () => {
    assert.equal(
      coachDisplayName({ firstName: "Pat", lastName: "Smith", email: "p@x.com" }),
      "Pat Smith",
    );
    assert.equal(coachDisplayName({ email: "p@x.com" }), "p@x.com");
  });

  it("formats upload dates", () => {
    assert.equal(formatUploadedAt(null), null);
    assert.ok(formatUploadedAt("2026-03-15T12:00:00.000Z"));
  });
});
