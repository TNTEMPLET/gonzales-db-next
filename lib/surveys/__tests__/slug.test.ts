import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isValidSurveySlug, parentSurveySlug, parentSurveyTitle, slugifySurveyTitle } from "../slug";

describe("survey slug helpers", () => {
  it("slugifies titles", () => {
    assert.equal(slugifySurveyTitle("2027 Spring Parent Survey"), "2027-spring-parent-survey");
    assert.equal(slugifySurveyTitle("Coach's Feedback!"), "coachs-feedback");
    assert.equal(slugifySurveyTitle("   "), "");
  });

  it("rejects invalid slugs", () => {
    assert.equal(isValidSurveySlug("2026-fall-parent-survey"), true);
    assert.equal(isValidSurveySlug("Nope"), false);
    assert.equal(isValidSurveySlug("-leading"), false);
  });

  it("builds parent-survey defaults", () => {
    assert.equal(parentSurveySlug(2027, "SPRING"), "2027-spring-parent-survey");
    assert.equal(parentSurveyTitle(2027, "FALL"), "2027 Fall Parent Survey");
  });
});
