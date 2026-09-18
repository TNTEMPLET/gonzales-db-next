import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeSurveyResults, surveyResultsToCsv } from "../summarizeResults";

describe("summarizeSurveyResults", () => {
  const questions = [
    {
      id: "q-rate",
      questionText: "Overall experience",
      type: "RATING",
      options: ["1 Poor", "2 Fair", "3 Good", "4 Very Good", "5 Excellent"],
      matrixTopics: [],
      sectionTitle: "Overall",
    },
    {
      id: "q-matrix",
      questionText: "Rate facilities",
      type: "MATRIX",
      options: [],
      matrixTopics: ["Field conditions", "Restrooms"],
      sectionTitle: "Facilities",
    },
    {
      id: "q-choice",
      questionText: "What should be our #1 priority for improvement next season?",
      type: "SINGLE_CHOICE",
      options: ["Facilities", "Umpires"],
      matrixTopics: [],
      sectionTitle: "Open",
    },
    {
      id: "q-text",
      questionText: "Comments",
      type: "TEXT",
      options: [],
      matrixTopics: [],
      sectionTitle: "Open",
    },
  ];

  const responses = [
    {
      id: "r1",
      organizationId: "gonzales",
      divisionName: "10U DYB",
      ageGroup: "10U DYB",
      respondentEmail: "a@x.com",
      wantsBoardContact: true,
      contactPhone: "555-0100",
      submittedAt: "2026-06-01T00:00:00.000Z",
      answers: [
        { id: "a1", questionId: "q-rate", matrixTopic: null, textValue: null, numberValue: 5, stringValue: "5" },
        { id: "a2", questionId: "q-matrix", matrixTopic: "Field conditions", textValue: null, numberValue: 4, stringValue: "4" },
        { id: "a3", questionId: "q-matrix", matrixTopic: "Restrooms", textValue: null, numberValue: 2, stringValue: "2" },
        { id: "a4", questionId: "q-choice", matrixTopic: null, textValue: null, numberValue: null, stringValue: "Facilities" },
        { id: "a5", questionId: "q-text", matrixTopic: null, textValue: "Great season", numberValue: null, stringValue: "Great season" },
      ],
    },
    {
      id: "r2",
      organizationId: "ascension",
      divisionName: "8U CP",
      ageGroup: "8U CP",
      respondentEmail: null,
      wantsBoardContact: false,
      contactPhone: null,
      submittedAt: "2026-06-02T00:00:00.000Z",
      answers: [
        { id: "a6", questionId: "q-rate", matrixTopic: null, textValue: null, numberValue: 3, stringValue: "3" },
        { id: "a7", questionId: "q-matrix", matrixTopic: "Field conditions", textValue: null, numberValue: 4, stringValue: "4" },
        { id: "a8", questionId: "q-choice", matrixTopic: null, textValue: null, numberValue: null, stringValue: "Umpires" },
      ],
    },
  ];

  it("builds per-question summaries and known snapshot cards", () => {
    const summary = summarizeSurveyResults({ questions, responses });
    assert.equal(summary.totalResponses, 2);

    const rating = summary.questions.find((q) => q.questionId === "q-rate");
    assert.equal(rating?.average, 4);
    assert.equal(rating?.count, 2);

    const matrix = summary.questions.find((q) => q.questionId === "q-matrix");
    const fields = matrix?.topics?.find((t) => t.topic === "Field conditions");
    assert.equal(fields?.average, 4);
    assert.equal(fields?.count, 2);

    assert.equal(summary.snapshot[0]?.key, "Field conditions");
    assert.equal(summary.snapshot[0]?.average, 4);

    const choice = summary.questions.find((q) => q.questionId === "q-choice");
    assert.equal(choice?.distribution?.find((d) => d.label === "Facilities")?.count, 1);

    assert.equal(summary.questions.find((q) => q.questionId === "q-text")?.comments?.length, 1);
    assert.equal(summary.contactRequests.length, 1);
    assert.equal(summary.responses.length, 2);
  });

  it("falls back to first rating averages when snapshot topics are missing", () => {
    const custom = summarizeSurveyResults({
      questions: [questions[0]],
      responses: [responses[0]],
    });
    assert.equal(custom.snapshot.length, 1);
    assert.equal(custom.snapshot[0]?.average, 5);
    assert.equal(custom.snapshot[0]?.key, "q-rate");
  });

  it("exports one CSV row per response with matrix columns", () => {
    const csv = surveyResultsToCsv({ questions, responses });
    assert.match(csv, /Field conditions/);
    assert.match(csv, /Great season/);
    const lines = csv.trim().split("\n");
    assert.equal(lines.length, 3);
  });
});
