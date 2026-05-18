import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bracketAgeSortKey, sortPublishedBrackets, type PublishedBracketSortInput } from "@/lib/tournament-brackets/publishedBracketSort";

function bracket(overrides: Partial<PublishedBracketSortInput>): PublishedBracketSortInput {
  return {
    id: overrides.id ?? overrides.name ?? "bracket",
    name: overrides.name ?? "Bracket",
    seasonYear: overrides.seasonYear ?? 2026,
    priority: overrides.priority,
    updatedAt: overrides.updatedAt ?? new Date("2026-05-01T00:00:00.000Z"),
    divisionLabel: overrides.divisionLabel,
  };
}

describe("published bracket sorting", () => {
  it("sorts numeric age groups before bracket name", () => {
    const sorted = sortPublishedBrackets([
      bracket({ id: "12u", name: "12U Majors", divisionLabel: "12U" }),
      bracket({ id: "8u", name: "8U Coach Pitch", divisionLabel: "8U" }),
      bracket({ id: "10u", name: "10U Minors", divisionLabel: "10U" }),
    ]);

    assert.deepEqual(
      sorted.map((item) => item.id),
      ["8u", "10u", "12u"],
    );
  });

  it("falls back to parsing the project name when the division label is missing", () => {
    const sorted = sortPublishedBrackets([
      bracket({ id: "name-12", name: "12U Gonzales Invitational" }),
      bracket({ id: "name-9", name: "9U Gonzales Invitational" }),
    ]);

    assert.deepEqual(
      sorted.map((item) => item.id),
      ["name-9", "name-12"],
    );
  });

  it("keeps non-age labels after age labels and sorts them by name", () => {
    const sorted = sortPublishedBrackets([
      bracket({ id: "open-b", name: "Open Silver" }),
      bracket({ id: "10u", name: "10U Gold", divisionLabel: "10U" }),
      bracket({ id: "open-a", name: "Open Gold" }),
    ]);

    assert.deepEqual(
      sorted.map((item) => item.id),
      ["10u", "open-a", "open-b"],
    );
  });

  it("uses season and update time as stable tie-breakers after labels and names", () => {
    const sorted = sortPublishedBrackets([
      bracket({ id: "older", name: "12U Gold", divisionLabel: "12U", seasonYear: 2025 }),
      bracket({
        id: "newer-update",
        name: "12U Gold",
        divisionLabel: "12U",
        seasonYear: 2026,
        updatedAt: new Date("2026-05-02T00:00:00.000Z"),
      }),
      bracket({
        id: "older-update",
        name: "12U Gold",
        divisionLabel: "12U",
        seasonYear: 2026,
        updatedAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
    ]);

    assert.deepEqual(
      sorted.map((item) => item.id),
      ["newer-update", "older-update", "older"],
    );
  });

  it("uses explicit priority before age and name ordering", () => {
    const sorted = sortPublishedBrackets([
      bracket({ id: "8u", name: "8U Coach Pitch", divisionLabel: "8U", priority: 20 }),
      bracket({ id: "12u", name: "12U Majors", divisionLabel: "12U", priority: 10 }),
      bracket({ id: "10u", name: "10U Minors", divisionLabel: "10U", priority: 10 }),
    ]);

    assert.deepEqual(
      sorted.map((item) => item.id),
      ["10u", "12u", "8u"],
    );
  });

  it("exposes whether a label has a parsed age group", () => {
    assert.deepEqual(bracketAgeSortKey({ name: "Fallback", divisionLabel: "7U Blue" }), {
      hasAge: true,
      age: 7,
      label: "7u blue",
    });
    assert.equal(bracketAgeSortKey({ name: "Open", divisionLabel: "" }).hasAge, false);
  });
});
