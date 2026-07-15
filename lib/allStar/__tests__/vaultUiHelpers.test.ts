import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRunoffBuilderTitle,
  displayNameFromCoachFields,
  getVisibilityForPreset,
  hasVisibleJerseyNumber,
  normalizeBallotEmail,
  sortBallotRosterRowsByName,
} from "../vaultUiHelpers";

describe("vaultUiHelpers", () => {
  it("sorts roster rows by display name", () => {
    const sorted = sortBallotRosterRowsByName([
      { displayName: "Zoe" },
      { displayName: "amy" },
      { displayName: "Bob" },
    ]);
    assert.deepEqual(
      sorted.map((r) => r.displayName),
      ["amy", "Bob", "Zoe"],
    );
  });

  it("normalizes emails", () => {
    assert.equal(normalizeBallotEmail("  Ada@Example.COM "), "ada@example.com");
  });

  it("builds coach display names", () => {
    assert.equal(
      displayNameFromCoachFields("Ada", "Lovelace", null, "a@x.com"),
      "Ada Lovelace",
    );
    assert.equal(
      displayNameFromCoachFields(null, null, "Coach", "a@x.com"),
      "Coach",
    );
    assert.equal(
      displayNameFromCoachFields(null, null, null, "a@x.com"),
      "a@x.com",
    );
  });

  it("filters placeholder jersey numbers", () => {
    assert.equal(hasVisibleJerseyNumber("12"), true);
    assert.equal(hasVisibleJerseyNumber("TBD"), false);
    assert.equal(hasVisibleJerseyNumber(""), false);
  });

  it("builds runoff titles", () => {
    assert.equal(
      buildRunoffBuilderTitle({ title: "11U Gold" }, "RUNOFF_TOP"),
      "11U Gold (Runoff)",
    );
    assert.equal(
      buildRunoffBuilderTitle({ ageGroup: "10U", seasonYear: 2026 }, "DEFAULT_SECOND"),
      "10U 2026 (Second Team)",
    );
  });

  it("returns roster preset visibility", () => {
    const vis = getVisibilityForPreset("ROSTER");
    assert.equal(vis.candidates, true);
    assert.equal(vis.access, false);
  });
});
