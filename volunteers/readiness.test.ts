import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeVolunteerReadiness, isMissingRequirement } from "./readiness";

describe("computeVolunteerReadiness", () => {
  it("returns INCOMPLETE when requirements are missing", () => {
    assert.equal(computeVolunteerReadiness([]), "INCOMPLETE");
    assert.equal(
      computeVolunteerReadiness([
        { requirementKey: "JDP", status: "CLEAR" },
        { requirementKey: "ABUSE_AWARENESS", status: "NOT_STARTED" },
      ]),
      "INCOMPLETE",
    );
  });

  it("returns READY when all required are CLEAR or WAIVED", () => {
    assert.equal(
      computeVolunteerReadiness([
        { requirementKey: "JDP", status: "CLEAR" },
        { requirementKey: "ABUSE_AWARENESS", status: "WAIVED" },
      ]),
      "READY",
    );
  });

  it("returns EXPIRED when any required is EXPIRED", () => {
    assert.equal(
      computeVolunteerReadiness([
        { requirementKey: "JDP", status: "EXPIRED" },
        { requirementKey: "ABUSE_AWARENESS", status: "CLEAR" },
      ]),
      "EXPIRED",
    );
  });

  it("returns BLOCKED when any required is FAILED", () => {
    assert.equal(
      computeVolunteerReadiness([
        { requirementKey: "JDP", status: "FAILED" },
        { requirementKey: "ABUSE_AWARENESS", status: "CLEAR" },
      ]),
      "BLOCKED",
    );
  });
});

describe("isMissingRequirement", () => {
  it("treats clear/waived as complete", () => {
    assert.equal(isMissingRequirement("CLEAR"), false);
    assert.equal(isMissingRequirement("WAIVED"), false);
    assert.equal(isMissingRequirement("NOT_STARTED"), true);
    assert.equal(isMissingRequirement("PENDING"), true);
  });
});
