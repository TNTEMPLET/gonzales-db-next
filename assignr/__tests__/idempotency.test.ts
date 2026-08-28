import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGameIdempotencyKey, buildGameUserDefinedId } from "@/lib/assignr/idempotency";
import type { AssignrGameImportRow } from "@/lib/assignr/gamesImportTypes";

describe("assignr idempotency", () => {
  const row: AssignrGameImportRow = {
    gameId: "",
    date: "May 18 2026",
    time: "5:45 PM",
    venue: "Tee Joe",
    subVenue: "Aldridge (1)",
    ageGroup: "9U DYB",
    gender: "",
    homeTeam: "Team A",
    awayTeam: "Team B",
    league: "DYB",
    gameType: "",
    pattern: "",
    paidBy: "",
    assignorName: "",
    notes: "",
    assignorNotes: "",
  };

  it("builds stable keys for the same game payload", () => {
    const first = buildGameIdempotencyKey(row, "515712");
    const second = buildGameIdempotencyKey({ ...row }, "515712");
    assert.equal(first, second);
    assert.match(buildGameUserDefinedId(row, "515712"), /^ap-/);
  });

  it("changes when league id changes", () => {
    const gonzales = buildGameIdempotencyKey(row, "515712");
    const ascension = buildGameIdempotencyKey(row, "430676");
    assert.notEqual(gonzales, ascension);
  });
});
