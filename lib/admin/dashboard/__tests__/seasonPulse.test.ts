import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { endOfCentralDay } from "@/lib/admin/dashboard/gameDay";
import { leagueCalendarDate } from "@/lib/seasonConfig";
import {
  buildOrgSeasonPicture,
  seasonWeekNumber,
  type SeasonGameInput,
} from "@/lib/admin/dashboard/seasonPulse";

const AS_OF = new Date("2026-09-23T18:30:00.000Z");

function game(partial: Partial<SeasonGameInput> & Pick<SeasonGameInput, "id" | "dateKey">): SeasonGameInput {
  return {
    startTime: "18:00",
    ageGroup: "10U",
    homeTeam: "Cubs",
    awayTeam: "Rockies",
    parkName: "JLS",
    fieldName: "Field 1",
    canceled: false,
    ...partial,
  };
}

function picture(games: SeasonGameInput[], scores: { gameExternalId: string; homeScore: number; awayScore: number }[] = [], extra: { outstandingCents?: number; rainouts?: number } = {}) {
  return buildOrgSeasonPicture({
    organizationId: "fallball",
    organizationLabel: "AP Fall Ball",
    seasonLabel: "Fall Ball 2026",
    seasonStart: "2026-08-01",
    games,
    scores,
    activeRainouts: extra.rainouts ?? 0,
    outstandingCents: extra.outstandingCents ?? 0,
    priorSeasonGrossCents: 120000,
    priorSeasonYear: 2025,
    asOf: AS_OF,
  });
}

describe("season pulse", () => {
  it("counts the Fall Ball week from the season start Monday", () => {
    assert.equal(seasonWeekNumber("2026-08-01", AS_OF), 9);
  });

  it("keeps an empty book quiet", () => {
    const board = picture([]);
    assert.equal(board.kpis.find((kpi) => kpi.key === "completeness")?.value, "—");
    assert.equal(board.unscored.length, 0);
    assert.equal(board.chips.find((chip) => chip.key === "unscored")?.tone, "neutral");
    assert.equal(board.weekly.length, 0);
    assert.equal(board.defaultAgeGroup, null);
  });

  it("excludes parks that are not entered on the score desk", () => {
    const board = picture([
      game({ id: "paula", dateKey: "2026-09-20", parkName: "Paula Park" }),
      game({ id: "missing", dateKey: "2026-09-20", homeTeam: "Yankees", awayTeam: "Mets" }),
    ]);
    assert.equal(board.unscored.map((row) => row.id).join(), "missing");
    assert.equal(board.kpis.find((kpi) => kpi.key === "completeness")?.value, "0%");
    assert.equal(board.chips.find((chip) => chip.key === "unscored")?.tone, "failure");
  });

  it("compares completeness with games from before this week and ignores a same-day game that has not started", () => {
    const board = picture(
      [
        game({ id: "old", dateKey: "2026-09-13" }),
        game({ id: "late", dateKey: "2026-09-22", homeTeam: "Yankees", awayTeam: "Mets" }),
        game({ id: "tonight", dateKey: "2026-09-23", startTime: "18:00" }),
        game({ id: "morning", dateKey: "2026-09-23", startTime: "12:00", homeTeam: "Reds", awayTeam: "Braves" }),
      ],
      [{ gameExternalId: "old", homeScore: 4, awayScore: 2 }],
    );
    const completeness = board.kpis.find((kpi) => kpi.key === "completeness");
    assert.equal(completeness?.value, "33%");
    assert.equal(completeness?.detail, "Before this week: 100% scored");
    assert.deepEqual(
      board.unscored.map((row) => row.id),
      ["late", "morning"],
    );
    assert.equal(board.unscored[0]?.daysLate, 1);
    assert.equal(board.unscored[1]?.daysLate, 0);
    assert.equal(board.chips.find((chip) => chip.key === "tonight")?.value, "2 games");
    assert.equal(board.weekly.at(-1)?.posted, 2);
    assert.equal(board.weekly.at(-1)?.scored, 0);
  });

  it("counts cancellations on the week card without treating them as missing scores", () => {
    const board = picture([
      game({ id: "played", dateKey: "2026-09-22" }),
      game({ id: "called", dateKey: "2026-09-24", canceled: true, homeTeam: "Yankees", awayTeam: "Mets" }),
    ], [{ gameExternalId: "played", homeScore: 1, awayScore: 0 }]);
    const week = board.kpis.find((kpi) => kpi.key === "week");
    assert.equal(week?.value, "1");
    assert.match(week?.detail ?? "", /^1 canceled/);
    assert.equal(week?.tone, "attention");
    assert.equal(board.unscored.length, 0);
    assert.equal(board.weekGames.find((row) => row.id === "called")?.scoreState, "canceled");
  });

  it("flags the team behind the division median and opens that division first", () => {
    const board = picture(
      [
        game({ id: "a", dateKey: "2026-09-13", ageGroup: "8U", homeTeam: "Cubs", awayTeam: "Reds" }),
        game({ id: "b", dateKey: "2026-09-15", ageGroup: "8U", homeTeam: "Cubs", awayTeam: "Reds" }),
        game({ id: "c", dateKey: "2026-09-20", ageGroup: "8U", homeTeam: "Mets", awayTeam: "Yankees" }),
        game({ id: "d", dateKey: "2026-09-20", ageGroup: "12U", homeTeam: "Braves", awayTeam: "Astros" }),
      ],
      [
        { gameExternalId: "a", homeScore: 5, awayScore: 1 },
        { gameExternalId: "b", homeScore: 3, awayScore: 2 },
        { gameExternalId: "d", homeScore: 8, awayScore: 0 },
      ],
    );
    assert.equal(board.defaultAgeGroup, "8U");
    const equity = board.kpis.find((kpi) => kpi.key === "equity");
    assert.equal(equity?.value, "2");
    assert.match(equity?.detail ?? "", /Mets is 1 game behind the 8U median/);
    const eights = board.divisions.find((division) => division.ageGroup === "8U");
    assert.equal(eights?.rows.find((row) => row.team === "Cubs")?.behindMedian, false);
    assert.equal(eights?.rows.find((row) => row.team === "Reds")?.behindMedian, false);
    assert.equal(eights?.rows.find((row) => row.team === "Mets")?.behindMedian, true);
    assert.equal(eights?.rows.find((row) => row.team === "Mets")?.wins, 0);
  });

  it("keeps a rained-out game on the card without calling it unscored", () => {
    const board = picture(
      [
        game({ id: "wet", dateKey: "2026-09-23", startTime: "12:00", parkName: "J Leo Stevens Park" }),
        game({ id: "dry", dateKey: "2026-09-22", parkName: "Other Park", homeTeam: "Yankees", awayTeam: "Mets" }),
      ],
      [],
    );
    const rained = buildOrgSeasonPicture({
      organizationId: "fallball",
      organizationLabel: "AP Fall Ball",
      seasonLabel: "Fall Ball 2026",
      seasonStart: "2026-08-01",
      games: [
        game({ id: "wet", dateKey: "2026-09-23", startTime: "12:00", parkName: "J Leo Stevens Park" }),
        game({ id: "dry", dateKey: "2026-09-22", parkName: "Other Park", homeTeam: "Yankees", awayTeam: "Mets" }),
      ],
      scores: [],
      activeRainouts: 0,
      rainout: { allParksOut: false, parks: ["J Leo Stevens Park"], throughDate: "2026-09-23" },
      outstandingCents: 0,
      priorSeasonGrossCents: null,
      priorSeasonYear: null,
      asOf: AS_OF,
    });
    assert.equal(board.unscored.map((row) => row.id).join(), "dry,wet");
    assert.deepEqual(
      rained.unscored.map((row) => row.id),
      ["dry"],
    );
    assert.equal(rained.weekGames.find((row) => row.id === "wet")?.scoreState, "rained-out");
    assert.equal(rained.chips.find((chip) => chip.key === "rainout")?.value, "J Leo Stevens Park");
    assert.notEqual(rained.weekGames.find((row) => row.id === "wet")?.scoreState, "canceled");
  });

  it("ends the Central day at 11:59:59 PM", () => {
    const end = endOfCentralDay(AS_OF);
    assert.equal(leagueCalendarDate(end), "2026-09-23");
    assert.equal(end.toISOString(), "2026-09-24T04:59:59.000Z");
  });

  it("opens finance when fees are outstanding and keeps a rainout red", () => {
    const board = picture([game({ id: "old", dateKey: "2026-09-13" })], [], {
      outstandingCents: 2500,
      rainouts: 1,
    });
    assert.equal(board.financeOpen, true);
    assert.equal(board.kpis.find((kpi) => kpi.key === "fees")?.value, "$25");
    assert.equal(board.kpis.find((kpi) => kpi.key === "fees")?.detail, "2025 gross $1,200");
    assert.equal(board.chips.find((chip) => chip.key === "rainout")?.tone, "failure");
  });
});
