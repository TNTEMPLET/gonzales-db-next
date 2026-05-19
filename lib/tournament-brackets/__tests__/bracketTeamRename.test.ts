import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  collectEditableTeamLabels,
  renameTeamLabelInSpec,
} from "@/lib/tournament-brackets/bracketTeamRename";
import { mergeMatchScoresIntoSpec, specHasSavedScores } from "@/lib/tournament-brackets/bracketScoring";

describe("bracketTeamRename", () => {
  it("collects distinct team labels and skips feeders", () => {
    const spec = parseBracketSpec({
      teams: ["Eagles", "Hawks"],
      rounds: [
        {
          id: "r1",
          label: "Final",
          matches: [{ id: "m1", home: "W1", away: "W2" }],
        },
        {
          id: "r0",
          label: "Semis",
          matches: [
            { id: "m2", home: "Eagles", away: "BYE" },
            { id: "m3", home: "Hawks", away: "Owls" },
          ],
        },
      ],
    });
    const labels = collectEditableTeamLabels(spec);
    assert.deepEqual(labels, ["Eagles", "Hawks", "Owls"]);
  });

  it("renames a label everywhere without changing scores", () => {
    let spec = parseBracketSpec({
      teams: ["Eagles"],
      rounds: [
        {
          id: "r0",
          label: "R1",
          matches: [
            {
              id: "m1",
              home: "Eagles",
              away: "Hawks",
              homeScore: 5,
              awayScore: 3,
              winnerSide: "home",
            },
          ],
        },
        {
          id: "r1",
          label: "Final",
          matches: [{ id: "m2", home: "Eagles", away: "Owls" }],
        },
      ],
    });

    spec = renameTeamLabelInSpec(spec, "Eagles", "Eagles (12U)");

    assert.equal(spec.rounds[0]?.matches[0]?.home, "Eagles (12U)");
    assert.equal(spec.rounds[0]?.matches[0]?.homeScore, 5);
    assert.equal(spec.rounds[0]?.matches[0]?.winnerSide, "home");
    assert.equal(spec.rounds[1]?.matches[0]?.home, "Eagles (12U)");
    assert.equal(spec.teams[0], "Eagles (12U)");
    assert.equal(spec.rounds[0]?.matches[0]?.away, "Hawks");
  });

  it("does not run advancement when only renaming after scores were saved", () => {
    let spec = parseBracketSpec({
      bracketFormat: "single_elimination",
      teams: ["A", "B", "C", "D"],
      rounds: [
        {
          id: "r0",
          label: "Semis",
          matches: [
            { id: "m1", home: "A", away: "B" },
            { id: "m2", home: "C", away: "D" },
          ],
        },
        {
          id: "r1",
          label: "Final",
          matches: [{ id: "m3", home: "TBD", away: "TBD" }],
        },
      ],
    });

    spec = mergeMatchScoresIntoSpec(spec, {
      m1: { homeScore: 4, awayScore: 2 },
    });
    assert.equal(spec.rounds[1]?.matches[0]?.home, "A");

    spec = renameTeamLabelInSpec(spec, "A", "Alpha");
    assert.equal(spec.rounds[1]?.matches[0]?.home, "Alpha");
    assert.equal(spec.rounds[0]?.matches[0]?.homeScore, 4);
    assert.equal(specHasSavedScores(spec), true);
  });
});
