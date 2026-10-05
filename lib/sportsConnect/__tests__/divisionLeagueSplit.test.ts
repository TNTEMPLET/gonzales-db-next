import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canSplitSpringProgram,
  isSpringProgramName,
  placeDivision,
  splitImportDenial,
  type DivisionPlacement,
} from "@/lib/sportsConnect/divisionLeagueSplit";
import { suggestProgramMapping } from "@/lib/sportsConnect/registrationHistory";

const placed = (
  organizationId: "gonzales" | "ascension",
  via: "tag" | "fixed" | "override",
): DivisionPlacement => ({ status: "placed", organizationId, via });

const blocked = (reason: "untagged" | "both_tags" | "conflict"): DivisionPlacement => ({
  status: "unplaceable",
  reason,
});

describe("division league tags and fixed rules", () => {
  const cases: Array<[string, DivisionPlacement]> = [
    ["12U LLB", placed("ascension", "tag")],
    ["12U DYB", placed("gonzales", "tag")],
    ["12u dyb", placed("gonzales", "tag")],
    ["12U-DYB", placed("gonzales", "tag")],
    ["12U (LLB)", placed("ascension", "tag")],
    ["12U/DYB", placed("gonzales", "tag")],
    ["(LLB)", placed("ascension", "tag")],
    ["12ULLB", blocked("untagged")],
    ["12U DYB LLB", blocked("both_tags")],
    ["12U llb / DYB", blocked("both_tags")],
    ["Tee Ball", placed("ascension", "fixed")],
    ["Tee-Ball", placed("ascension", "fixed")],
    ["T-Ball", placed("ascension", "fixed")],
    ["t ball", placed("ascension", "fixed")],
    ["TeeBall", placed("ascension", "fixed")],
    ["Tee Ball, 5 year-olds", placed("ascension", "fixed")],
    ["Modified Tee Ball", placed("ascension", "fixed")],
    ["Little League Tee Ball", placed("ascension", "fixed")],
    ["3/4 Year-Old Tball", placed("ascension", "fixed")],
    ["softball", blocked("untagged")],
    ["Tee Ball DYB", blocked("conflict")],
    ["7U Minors", placed("ascension", "fixed")],
    ["8U Minors", placed("ascension", "fixed")],
    ["7/8 Majors", placed("ascension", "fixed")],
    ["7 / 8 Majors", placed("ascension", "fixed")],
    ["8U-Minors", placed("ascension", "fixed")],
    ["7U Minors LLB", placed("ascension", "tag")],
    ["7U Minors DYB", blocked("conflict")],
    ["14U", placed("gonzales", "fixed")],
    ["17U", placed("gonzales", "fixed")],
    ["14u", placed("gonzales", "fixed")],
    ["14U DYB", placed("gonzales", "tag")],
    ["14U LLB", blocked("conflict")],
    ["14U Majors", blocked("untagged")],
    ["10U", blocked("untagged")],
    ["Coach Pitch", blocked("untagged")],
  ];

  for (const [divisionName, expected] of cases) {
    it(`places ${divisionName}`, () => {
      assert.deepEqual(placeDivision(divisionName), expected);
    });
  }

  it("uses an override only when the division cannot be placed", () => {
    assert.deepEqual(placeDivision("10U", "ascension"), placed("ascension", "override"));
    assert.deepEqual(placeDivision("14U LLB", "gonzales"), placed("gonzales", "override"));
    assert.deepEqual(placeDivision("Tee Ball DYB", "ascension"), placed("ascension", "override"));
    assert.deepEqual(placeDivision("12U DYB LLB", "gonzales"), placed("gonzales", "override"));
    assert.deepEqual(placeDivision("12U DYB", "ascension"), placed("gonzales", "tag"));
    assert.deepEqual(placeDivision("14U", "ascension"), placed("gonzales", "fixed"));
  });

  it("keeps a combined Spring program as a skip suggestion with its year", () => {
    assert.deepEqual(suggestProgramMapping("2027 Combined Spring Season"), {
      action: "skip",
      organizationId: null,
      seasonYear: 2027,
      fallLocked: false,
    });
  });

  it("does not treat a non-spring or Fall program as splittable", () => {
    assert.equal(isSpringProgramName("2027 Combined Spring Season"), true);
    assert.equal(canSplitSpringProgram("2026 Gonzales DYB Spring Season"), true);
    assert.equal(canSplitSpringProgram("AP Baseball - Fall 2026"), false);
    assert.equal(canSplitSpringProgram("2027 Summer Clinic"), false);
    assert.equal(isSpringProgramName("Fall Spring Showcase"), false);
  });

  it("refuses a split import for anyone who is not a master admin", () => {
    assert.equal(
      splitImportDenial(false, [{ action: "split" }]),
      "Only a master admin can split a Spring program by division.",
    );
    assert.equal(splitImportDenial(true, [{ action: "split" }]), null);
    assert.equal(splitImportDenial(false, [{ action: "map" }, { action: "skip" }]), null);
  });
});
