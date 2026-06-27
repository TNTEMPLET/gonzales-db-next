import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { importCompletedGcScoresWithProgression } from "@/lib/gamechanger/syncGameChangerToProject";
import type { GcScoreboardEvent } from "@/lib/gamechanger/types";
import { parseBracketSpec, type BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { generateDoubleEliminationRoundsFromTeams } from "@/lib/tournament-brackets/generateDoubleElimFromTeams";

const WIDGET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function completedEvent(
  gameNum: number,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  startTs: string,
): GcScoreboardEvent {
  return {
    id: `00000000-0000-4000-8000-${String(gameNum).padStart(12, "0")}`,
    start_ts: startTs,
    game_status: "completed",
    home_team: { id: `h${gameNum}`, name: home, score: homeScore },
    away_team: { id: `a${gameNum}`, name: away, score: awayScore },
  };
}

function matchByGame(spec: BracketSpec, gameNum: number) {
  for (const r of spec.rounds) {
    for (const m of r.matches) {
      if (m.officialGameNumber === String(gameNum)) return m;
    }
  }
  throw new Error(`Game ${gameNum} not found`);
}

function addSchedule(spec: BracketSpec): BracketSpec {
  const schedule: Record<string, { dateLabel: string; time: string }> = {
    "1": { dateLabel: "6/26", time: "7:30PM" },
    "2": { dateLabel: "6/27", time: "10:00AM" },
    "3": { dateLabel: "6/28", time: "10:00AM" },
    "4": { dateLabel: "6/28", time: "12:30PM" },
    "5": { dateLabel: "6/29", time: "6:00PM" },
    "6": { dateLabel: "7/1", time: "6:30PM" },
    "7": { dateLabel: "7/2", time: "6:30PM" },
  };
  return {
    ...spec,
    rounds: spec.rounds.map((round) => ({
      ...round,
      matches: round.matches.map((match) => ({
        ...match,
        ...(match.officialGameNumber ? schedule[match.officialGameNumber] : undefined),
      })),
    })),
  };
}

describe("syncGameChangerToProject", () => {
  it("imports completed downstream finals after bracket advancement in one pass", () => {
    const teams = ["Eastbank", "Bogalusa", "Ascension", "St. Charles"];
    const base = parseBracketSpec({
      version: 1,
      bracketFormat: "double_elimination",
      teams,
      rounds: generateDoubleEliminationRoundsFromTeams(teams),
      gameChanger: { widgetId: WIDGET_ID },
      setupWizardCompleted: true,
    });
    const spec = addSchedule(base);

    const result = importCompletedGcScoresWithProgression(
      spec,
      [
        completedEvent(1, "12U Eastbank", "12U Bogalusa", 23, 0, "2026-06-27T00:30:00.000Z"),
        completedEvent(2, "12U Ascension LL", "12U St. Charles", 10, 1, "2026-06-27T15:00:00.000Z"),
        completedEvent(3, "12U Eastbank", "12U Ascension LL", 7, 3, "2026-06-28T15:00:00.000Z"),
        completedEvent(4, "12U Bogalusa", "12U St. Charles", 4, 2, "2026-06-28T17:30:00.000Z"),
        completedEvent(5, "12U Ascension LL", "12U Bogalusa", 5, 4, "2026-06-29T23:00:00.000Z"),
        completedEvent(6, "12U Eastbank", "12U Ascension LL", 8, 6, "2026-07-01T23:30:00.000Z"),
      ],
      undefined,
      { autoImport: true },
    );

    assert.equal(result.specUpdated, true);
    assert.deepEqual(
      result.importedMatchIds.map((id) =>
        result.spec.rounds
          .flatMap((r) => r.matches)
          .find((m) => m.id === id)?.officialGameNumber,
      ),
      ["1", "2", "3", "4", "5", "6"],
    );
    assert.equal(matchByGame(result.spec, 6).home, "Eastbank");
    assert.equal(matchByGame(result.spec, 6).away, "Ascension");
    assert.equal(matchByGame(result.spec, 6).homeScore, 8);
    assert.equal(matchByGame(result.spec, 6).awayScore, 6);
    assert.equal(result.spec.championTeamName, "Eastbank");
    assert.equal(result.spec.gameChanger?.importedFinalEventIds?.length, 6);
    assert.equal(
      result.live.eventsByMatchId[matchByGame(result.spec, 6).id]?.id,
      "00000000-0000-4000-8000-000000000006",
    );
  });
});
