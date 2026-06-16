import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parsePdfTournamentInfo } from "@/lib/tournament-brackets/ingestion/parsePdfTournamentInfo";

describe("parsePdfTournamentInfo", () => {
  it("parses inline Little League header fields", () => {
    const text = `
Division: Majors (12U)
Site(s): Jambalaya Park
Update Phone: 225-555-0100
Tournament Director: Jane Smith
Next Level: District 6
`.trim();

    assert.deepEqual(parsePdfTournamentInfo(text), {
      division: "Majors (12U)",
      sites: "Jambalaya Park",
      updatePhone: "225-555-0100",
      tournamentDirector: "Jane Smith",
      nextLevel: "District 6",
    });
  });

  it("reads values from the following line when the label line is empty", () => {
    const text = `
Division:
Minors 10U
Site(s):
North Park Complex
`.trim();

    assert.deepEqual(parsePdfTournamentInfo(text), {
      division: "Minors 10U",
      sites: "North Park Complex",
    });
  });

  it("accepts Next Next Level label variant", () => {
    const text = "Next Next Level: State Tournament";
    assert.deepEqual(parsePdfTournamentInfo(text), { nextLevel: "State Tournament" });
  });

  it("returns undefined when no fields are present", () => {
    assert.equal(parsePdfTournamentInfo("Winners bracket\nGame 1"), undefined);
  });
});
