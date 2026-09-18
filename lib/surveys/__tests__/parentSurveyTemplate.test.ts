import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parentSurveyTemplateSections } from "../parentSurveyTemplate";

describe("parentSurveyTemplate", () => {
  it("has 8 sections and 15 questions including a Yes/No gate", () => {
    const sections = parentSurveyTemplateSections();
    assert.equal(sections.length, 8);
    const questions = sections.flatMap((s) => s.questions);
    assert.equal(questions.length, 15);
    assert.ok(questions.some((q) => q.type === "CONDITIONAL_GATE"));
    assert.ok(questions.some((q) => q.matrixTopics.includes("Field conditions")));
  });
});
