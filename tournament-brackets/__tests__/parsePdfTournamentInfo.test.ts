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

  it("collects multiline visual PDF header fields", () => {
    const text = `
Division: Little League Minor 9
Site(s): Butch Gore Park
14450 Harry Savoy Road St. Amant, LA 70774
Update Phone: (225) 223-9470 Wayne Grenfell
Tournament Director: Wayne Grenfell/Frank Renaudin
Next Level: Little League State Tourney July 17-23
St. Julien Park, 701 Nazare Rd. Broussard, LA 70518
Top 2 teams advance to State. Modified Bracket
5 Team Little League Bracket
Winners' Bracket
Game 1
`.trim();

    assert.deepEqual(parsePdfTournamentInfo(text), {
      division: "Little League Minor 9",
      sites: "Butch Gore Park\n14450 Harry Savoy Road St. Amant, LA 70774",
      updatePhone: "(225) 223-9470",
      tournamentDirector: "Wayne Grenfell/Frank Renaudin",
      nextLevel:
        "Little League State Tourney July 17-23\nSt. Julien Park, 701 Nazare Rd. Broussard, LA 70518\nTop 2 teams advance to State. Modified Bracket",
    });
  });

  it("returns undefined when no fields are present", () => {
    assert.equal(parsePdfTournamentInfo("Winners bracket\nGame 1"), undefined);
  });
});
