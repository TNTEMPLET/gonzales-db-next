import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatRelativeTime,
  getDisplayName,
  getFieldLabel,
  getParkLabel,
} from "../timelineFormat";

describe("dugout timelineFormat", () => {
  it("builds display names", () => {
    assert.equal(
      getDisplayName({ firstName: "Ada", lastName: "Lovelace", email: "a@x.com" }),
      "Ada Lovelace",
    );
    assert.equal(getDisplayName({ email: "a@x.com" }), "a@x.com");
  });

  it("formats relative times for recent posts", () => {
    const recent = new Date(Date.now() - 2 * 60_000).toISOString();
    assert.equal(formatRelativeTime(recent), "2m");
  });

  it("reads park and field labels", () => {
    assert.equal(
      getParkLabel({ _embedded: { venue: { name: "Pelican" } } }),
      "Pelican",
    );
    assert.equal(getParkLabel({}), "Other Parks");
    assert.equal(getFieldLabel({ subvenue: "Field 3" }), "Field 3");
    assert.equal(getFieldLabel({}), "Other Fields");
  });
});
