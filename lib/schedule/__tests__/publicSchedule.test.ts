import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterPublicGames,
  groupPublicGames,
  groupPublicPractices,
  isPlacedPublicGame,
  weekdayIndexFromDateKey,
  type PublicPracticeSlot,
  type PublicScheduleGame,
} from "@/lib/schedule/publicSchedule";
import { buildSeasonGamesPdf, buildTeamSchedulePdf } from "@/lib/schedule/publicSchedulePdf";

function game(partial: Partial<PublicScheduleGame> & Pick<PublicScheduleGame, "id" | "dateKey" | "homeTeam">): PublicScheduleGame {
  const weekdayIndex = weekdayIndexFromDateKey(partial.dateKey);
  return {
    weekdayIndex,
    weekdayName: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekdayIndex]!,
    dateLabel: partial.dateKey,
    timeLabel: "6:00 PM",
    startTime: "18:00",
    ageGroup: "8U CP",
    awayTeam: "Astros",
    parkName: "JLS",
    fieldName: "Field 1",
    status: "A",
    homeTeamId: null,
    awayTeamId: null,
    ...partial,
  };
}

describe("public schedule grouping", () => {
  it("keeps UTC date-only nights on that weekday, not the Chicago evening before", () => {
    const stored = new Date("2026-09-28T00:00:00.000Z");
    const key = stored.toISOString().slice(0, 10);
    assert.equal(key, "2026-09-28");
    assert.equal(weekdayIndexFromDateKey(key), 1);
  });

  it("excludes canceled and unplaced games", () => {
    assert.equal(
      isPlacedPublicGame({
        gameDate: new Date("2026-09-14T12:00:00Z"),
        startTime: "18:00",
        homeTeamName: "Yankees",
        awayTeamName: "Astros",
        status: "DRAFT",
      }),
      true,
    );
    assert.equal(
      isPlacedPublicGame({
        gameDate: new Date("2026-09-14T12:00:00Z"),
        startTime: "18:00",
        homeTeamName: "Yankees",
        awayTeamName: "Astros",
        status: "CANCELED",
      }),
      false,
    );
    assert.equal(
      isPlacedPublicGame({
        gameDate: null,
        startTime: "18:00",
        homeTeamName: "Yankees",
        awayTeamName: "Astros",
        status: "DRAFT",
      }),
      false,
    );
  });

  it("groups park → field → Monday before Wednesday, dates ascending", () => {
    const grouped = groupPublicGames([
      game({
        id: "g2",
        dateKey: "2026-09-16",
        parkName: "JLS",
        fieldName: "Field 2",
        homeTeam: "Cubs",
      }),
      game({
        id: "g3",
        dateKey: "2026-09-21",
        parkName: "JLS",
        fieldName: "Field 1",
        homeTeam: "Yankees",
      }),
      game({
        id: "g1",
        dateKey: "2026-09-14",
        parkName: "JLS",
        fieldName: "Field 1",
        homeTeam: "Yankees",
      }),
      game({
        id: "g4",
        dateKey: "2026-09-14",
        parkName: "Dutchtown",
        fieldName: "Field 1",
        homeTeam: "Mets",
      }),
    ]);

    assert.deepEqual(
      grouped.map((park) => park.parkName),
      ["Dutchtown", "JLS"],
    );
    const jls = grouped[1]!;
    assert.deepEqual(
      jls.fields.map((field) => field.fieldName),
      ["Field 1", "Field 2"],
    );
    assert.deepEqual(
      jls.fields[0]!.weekdays.map((day) => day.weekdayName),
      ["Monday"],
    );
    assert.deepEqual(
      jls.fields[0]!.weekdays[0]!.games.map((row) => row.dateKey),
      ["2026-09-14", "2026-09-21"],
    );
    assert.equal(jls.fields[1]!.weekdays[0]!.weekdayName, "Wednesday");
  });

  it("filters games by one or more parks", () => {
    const rows = [
      game({ id: "jls", dateKey: "2026-09-14", parkName: "JLS", homeTeam: "Yankees" }),
      game({ id: "dutch", dateKey: "2026-09-14", parkName: "Dutchtown", homeTeam: "Mets" }),
    ];
    const onlyJls = filterPublicGames(rows, { parks: ["JLS"] });
    assert.deepEqual(
      onlyJls.map((row) => row.id),
      ["jls"],
    );
    const both = filterPublicGames(rows, { parks: ["JLS", "Dutchtown"] });
    assert.equal(both.length, 2);
  });

  it("groups practices by park, field, and weekday", () => {
    const slots: PublicPracticeSlot[] = [
      {
        id: "p1",
        weekdayIndex: 3,
        weekdayName: "Wednesday",
        timeLabel: "6:00 PM",
        startTime: "18:00",
        ageGroup: "8U CP",
        teamName: "Yankees",
        teamId: "t1",
        parkName: "JLS",
        fieldName: "Velo",
        pairTeamName: "Astros",
      },
      {
        id: "p2",
        weekdayIndex: 1,
        weekdayName: "Monday",
        timeLabel: "6:00 PM",
        startTime: "18:00",
        ageGroup: "8U CP",
        teamName: "Cubs",
        teamId: "t2",
        parkName: "JLS",
        fieldName: "Velo",
        pairTeamName: null,
      },
    ];
    const grouped = groupPublicPractices(slots);
    assert.equal(grouped[0]!.fields[0]!.weekdays[0]!.weekdayName, "Monday");
    assert.equal(grouped[0]!.fields[0]!.weekdays[1]!.weekdayName, "Wednesday");
  });
});

describe("public schedule PDFs", () => {
  it("fits a 10-game team sheet on one page", () => {
    const games = Array.from({ length: 10 }, (_, index) =>
      game({
        id: `g${index}`,
        dateKey: `2026-09-${String(14 + index).padStart(2, "0")}`,
        homeTeam: "Yankees",
        awayTeam: `Opp ${index + 1}`,
      }),
    );
    const practices: PublicPracticeSlot[] = [
      {
        id: "p1",
        weekdayIndex: 1,
        weekdayName: "Monday",
        timeLabel: "6:00 PM",
        startTime: "18:00",
        ageGroup: "8U CP",
        teamName: "Yankees",
        teamId: "t1",
        parkName: "JLS",
        fieldName: "Velo",
        pairTeamName: "Astros",
      },
    ];
    const pdf = buildTeamSchedulePdf({
      orgName: "AP Fall Ball",
      seasonName: "Fall Ball 2026",
      ageGroup: "8U CP",
      teamName: "Yankees",
      games,
      practices,
    });
    assert.equal(Buffer.from(pdf.buffer.subarray(0, 5)).toString(), "%PDF-");
    assert.equal(pdf.pageCount, 1);
  });

  it("builds a season PDF from park/field/weekday groups", () => {
    const pdf = buildSeasonGamesPdf({
      orgName: "AP Fall Ball",
      seasonName: "Fall Ball 2026",
      games: [
        game({ id: "a", dateKey: "2026-09-14", parkName: "JLS", fieldName: "Field 1", homeTeam: "Yankees" }),
        game({ id: "b", dateKey: "2026-09-16", parkName: "JLS", fieldName: "Field 2", homeTeam: "Cubs" }),
      ],
    });
    assert.equal(Buffer.from(pdf.buffer.subarray(0, 5)).toString(), "%PDF-");
    assert.ok(pdf.pageCount >= 1);
  });
});
