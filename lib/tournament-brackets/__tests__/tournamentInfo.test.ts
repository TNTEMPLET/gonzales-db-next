import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  tournamentInfoFields,
  tournamentInfoValueLines,
} from "@/lib/tournament-brackets/tournamentInfo";

describe("tournamentInfo", () => {
  it("formats site values as venue, street, city/state/ZIP lines", () => {
    assert.deepEqual(
      tournamentInfoValueLines(
        "sites",
        "Butch Gore Ballpark - 14450 Harry Savoy Road, St. Amant, LA 70774",
      ),
      ["Butch Gore Ballpark", "14450 Harry Savoy Road", "St. Amant, LA 70774"],
    );
  });

  it("splits semicolon-separated location details into display blocks", () => {
    assert.deepEqual(
      tournamentInfoValueLines(
        "nextLevel",
        "Little League State Tourney July 17-23; St. Julien Park, 701 Nazaire Rd Broussard, LA 70518",
      ),
      [
        "Little League State Tourney July 17-23",
        "",
        "St. Julien Park",
        "701 Nazaire Rd",
        "Broussard, LA 70518",
      ],
    );
  });

  it("marks Next Level as a field while preserving field order", () => {
    const fields = tournamentInfoFields({
      division: "Little League 11U",
      sites: "Butch Gore Ballpark - 14450 Harry Savoy Road, St. Amant, LA 70774",
      nextLevel: "State Tournament",
    });

    assert.deepEqual(fields.map((f) => f.key), ["division", "sites", "nextLevel"]);
    assert.deepEqual(fields[1]?.lines, [
      "Butch Gore Ballpark",
      "14450 Harry Savoy Road",
      "St. Amant, LA 70774",
    ]);
  });
});
