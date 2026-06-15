import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyScheduleByGameNumber,
  countFirstRoundByeMatches,
  firstRoundNonByeMatches,
  withStableMatchIds,
} from "@/lib/tournament-brackets/applyBracketSchedule";
import { generateDoubleEliminationRoundsFromTeams } from "@/lib/tournament-brackets/generateDoubleElimFromTeams";

describe("applyBracketSchedule", () => {
  it("applies schedule patches by official game number", () => {
    let rounds = generateDoubleEliminationRoundsFromTeams(["A", "B", "C", "D"]);
    rounds = applyScheduleByGameNumber(rounds, {
      "1": { dateLabel: "Mon 6/1", time: "6:00 PM", field: "Field 1" },
    });
    const g1 = rounds.flatMap((r) => r.matches).find((m) => m.officialGameNumber === "1");
    assert.equal(g1?.dateLabel, "Mon 6/1");
    assert.equal(g1?.field, "Field 1");
  });

  it("assigns stable match ids from game numbers", () => {
    let rounds = generateDoubleEliminationRoundsFromTeams(["A", "B", "C", "D"]);
    rounds = withStableMatchIds(rounds, "10u");
    const g2 = rounds.flatMap((r) => r.matches).find((m) => m.officialGameNumber === "2");
    assert.equal(g2?.id, "10u-g2");
  });

  it("counts first-round byes for five-team padded bracket", () => {
    const rounds = generateDoubleEliminationRoundsFromTeams([
      "Ponchatoula",
      "Loranger",
      "Kentwood",
      "Franklinton",
      "Gonzales",
    ]);
    assert.equal(countFirstRoundByeMatches(rounds), 3);
    const live = firstRoundNonByeMatches(rounds);
    assert.equal(live.length, 1);
    assert.equal(live[0]!.home, "Franklinton");
    assert.equal(live[0]!.away, "Gonzales");
  });
});
