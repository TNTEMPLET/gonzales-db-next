import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bracketSurfaceTitle,
  formatDivisionDisplayLabel,
} from "@/lib/tournament-brackets/bracketDisplayLabels";
import { championPlaqueHeading } from "@/lib/tournament-brackets/bracketLayout";

describe("formatDivisionDisplayLabel", () => {
  it("humanizes compact PDF division labels", () => {
    assert.equal(formatDivisionDisplayLabel("LittleLeagueCoachPitch"), "Little League Coach Pitch");
    assert.equal(formatDivisionDisplayLabel("LitleLeagueCoachPitch"), "Little League Coach Pitch");
    assert.equal(formatDivisionDisplayLabel("12U Majors"), "12U Majors");
  });

  it("feeds readable bracket titles and plaques", () => {
    assert.equal(bracketSurfaceTitle("LittleLeagueCoachPitch"), "Little League Coach Pitch");
    assert.equal(championPlaqueHeading("LittleLeagueCoachPitch"), "Coaches Pitch Champion");
  });
});
