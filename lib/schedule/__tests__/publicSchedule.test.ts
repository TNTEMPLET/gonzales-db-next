import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collapseSharedPracticeSlots,
  expandRotationPracticeSlots,
  filterPublicGames,
  filterPublicPractices,
  firstMondayOnOrAfter,
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

  it("excludes draft, canceled, and unplaced games from the public board", () => {
    const placed = {
      gameDate: new Date("2026-09-14T12:00:00Z"),
      startTime: "18:00",
      homeTeamName: "Yankees",
      awayTeamName: "Astros",
    };
    assert.equal(isPlacedPublicGame({ ...placed, status: "LOCKED" }), true);
    assert.equal(isPlacedPublicGame({ ...placed, status: "EXPORTED" }), true);
    assert.equal(isPlacedPublicGame({ ...placed, status: "DRAFT" }), false);
    assert.equal(isPlacedPublicGame({ ...placed, status: "READY" }), false);
    assert.equal(isPlacedPublicGame({ ...placed, status: "CANCELED" }), false);
    assert.equal(
      isPlacedPublicGame({
        ...placed,
        gameDate: null,
        status: "LOCKED",
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
    assert.deepEqual(grouped[0]!.dates, []);
  });

  it("groups dated rotation practices by calendar date, not weekday", () => {
    const slot = (
      id: string,
      dateKey: string,
      weekdayIndex: number,
      weekdayName: string,
      fieldName: string,
    ): PublicPracticeSlot => ({
      id,
      weekdayIndex,
      weekdayName,
      timeLabel: "5:45 PM",
      startTime: "17:45",
      ageGroup: "12U",
      teamName: "Cubs - Jones",
      teamId: "t1",
      parkName: "Tee-Joe Gonzales Park",
      fieldName,
      pairTeamName: null,
      dateKey,
      dateLabel: `${weekdayName.slice(0, 3)}, ${dateKey}`,
    });
    const grouped = groupPublicPractices([
      slot("wed-late", "2026-09-16", 3, "Wednesday", "Berthelot Field"),
      slot("mon-late", "2026-09-14", 1, "Monday", "Patterson Field"),
      slot("mon-early", "2026-09-07", 1, "Monday", "Berthelot Field"),
    ]);
    assert.deepEqual(
      grouped[0]!.dates.map((item) => item.dateKey),
      ["2026-09-07", "2026-09-14", "2026-09-16"],
    );
    assert.equal(grouped[0]!.fields.length, 0);
    assert.equal(grouped[0]!.dates[1]!.slots[0]!.fieldName, "Patterson Field");
  });

  it("collapses a shared field pair into one time slot", () => {
    const slots: PublicPracticeSlot[] = [
      {
        id: "p-yankees",
        weekdayIndex: 1,
        weekdayName: "Monday",
        timeLabel: "5:45 PM",
        startTime: "17:45",
        ageGroup: "8U CP",
        teamName: "Yankees",
        teamId: "t1",
        parkName: "JLS",
        fieldName: "Field 1",
        pairTeamName: null,
        sharedFieldGroupId: "pair-yankees-astros",
      },
      {
        id: "p-astros",
        weekdayIndex: 1,
        weekdayName: "Monday",
        timeLabel: "5:45 PM",
        startTime: "17:45",
        ageGroup: "8U CP",
        teamName: "Astros",
        teamId: "t2",
        parkName: "JLS",
        fieldName: "Field 1",
        pairTeamName: null,
        sharedFieldGroupId: "pair-yankees-astros",
      },
      {
        id: "p-cubs",
        weekdayIndex: 1,
        weekdayName: "Monday",
        timeLabel: "7:15 PM",
        startTime: "19:15",
        ageGroup: "8U CP",
        teamName: "Cubs",
        teamId: "t3",
        parkName: "JLS",
        fieldName: "Field 1",
        pairTeamName: null,
        sharedFieldGroupId: null,
      },
    ];
    const collapsed = collapseSharedPracticeSlots(slots);
    assert.equal(collapsed.length, 2);
    const shared = collapsed.find((slot) => slot.sharedFieldGroupId === "pair-yankees-astros");
    assert.ok(shared);
    assert.equal(shared!.timeLabel, "5:45 PM");
    assert.equal(shared!.teamName, "Astros");
    assert.equal(shared!.pairTeamName, "Yankees");
    assert.equal(collapsed.filter((slot) => slot.startTime === "17:45").length, 1);
  });

  it("keeps one shared slot when filtering by either team", () => {
    const slots: PublicPracticeSlot[] = [
      {
        id: "p-yankees",
        weekdayIndex: 1,
        weekdayName: "Monday",
        timeLabel: "5:45 PM",
        startTime: "17:45",
        ageGroup: "8U CP",
        teamName: "Yankees",
        teamId: "t1",
        parkName: "JLS",
        fieldName: "Field 1",
        pairTeamName: "Astros",
        sharedFieldGroupId: "pair-yankees-astros",
      },
      {
        id: "p-astros",
        weekdayIndex: 1,
        weekdayName: "Monday",
        timeLabel: "5:45 PM",
        startTime: "17:45",
        ageGroup: "8U CP",
        teamName: "Astros",
        teamId: "t2",
        parkName: "JLS",
        fieldName: "Field 1",
        pairTeamName: "Yankees",
        sharedFieldGroupId: "pair-yankees-astros",
      },
    ];
    const yankees = filterPublicPractices(slots, { teams: ["Yankees"] });
    assert.equal(yankees.length, 1);
    assert.equal(yankees[0]!.teamName, "Yankees");
    assert.equal(yankees[0]!.pairTeamName, "Astros");
    const astros = filterPublicPractices(slots, { teams: ["Astros"] });
    assert.equal(astros.length, 1);
    assert.equal(astros[0]!.teamName, "Astros");
    assert.equal(astros[0]!.pairTeamName, "Yankees");
  });

  it("starts a 3-week cycle on the first Monday on or after season start", () => {
    assert.equal(firstMondayOnOrAfter("2026-09-06"), "2026-09-07");
    assert.equal(firstMondayOnOrAfter("2026-09-07"), "2026-09-07");
  });

  it("expands Week 1/2/3 slots onto calendar dates in the season window", () => {
    const week1: PublicPracticeSlot = {
      id: "p-w1",
      weekdayIndex: 1,
      weekdayName: "Monday",
      timeLabel: "5:45 PM",
      startTime: "17:45",
      ageGroup: "12U",
      teamName: "Cubs - Jones",
      teamId: "t1",
      parkName: "Tee-Joe Gonzales Park",
      fieldName: "Berthelot Field",
      pairTeamName: "Padres - Lott",
      sharedFieldGroupId: "pair-week-1",
      notes: "Week 1",
      rotationWeek: 1,
    };
    const week2: PublicPracticeSlot = {
      ...week1,
      id: "p-w2",
      notes: "Week 2",
      rotationWeek: 2,
      sharedFieldGroupId: "pair-week-2",
    };
    const weekly: PublicPracticeSlot = {
      ...week1,
      id: "p-weekly",
      ageGroup: "6U MOD",
      teamName: "Athletics - Gautreau",
      pairTeamName: "Rangers - York",
      sharedFieldGroupId: null,
      notes: null,
      rotationWeek: null,
    };
    const expanded = expandRotationPracticeSlots([week1, week2, weekly], {
      startDate: "2026-09-06",
      endDate: "2026-10-31",
      cycleWeeks: 3,
    });
    assert.deepEqual(
      expanded.filter((slot) => slot.id.startsWith("p-w1:")).map((slot) => slot.dateKey),
      ["2026-09-07", "2026-09-28", "2026-10-19"],
    );
    assert.deepEqual(
      expanded.filter((slot) => slot.id.startsWith("p-w2:")).map((slot) => slot.dateKey),
      ["2026-09-14", "2026-10-05", "2026-10-26"],
    );
    const standing = expanded.filter((slot) => slot.id === "p-weekly");
    assert.equal(standing.length, 1);
    assert.equal(standing[0]!.dateKey ?? null, null);
  });

  it("stops Fall Ball rotation dates on Sep 26 so the 3-week cycle does not repeat into games", () => {
    const week1: PublicPracticeSlot = {
      id: "p-w1",
      weekdayIndex: 1,
      weekdayName: "Monday",
      timeLabel: "5:45 PM",
      startTime: "17:45",
      ageGroup: "12U",
      teamName: "Cubs - Jones",
      teamId: "t1",
      parkName: "Tee-Joe Gonzales Park",
      fieldName: "Berthelot Field",
      pairTeamName: "Padres - Lott",
      notes: "Week 1",
      rotationWeek: 1,
    };
    const week2: PublicPracticeSlot = { ...week1, id: "p-w2", notes: "Week 2", rotationWeek: 2 };
    const week3: PublicPracticeSlot = { ...week1, id: "p-w3", notes: "Week 3", rotationWeek: 3 };
    const expanded = expandRotationPracticeSlots([week1, week2, week3], {
      startDate: "2026-09-06",
      endDate: "2026-09-26",
      cycleWeeks: 3,
    });
    assert.deepEqual(
      expanded.map((slot) => slot.dateKey),
      ["2026-09-07", "2026-09-14", "2026-09-21"],
    );
    assert.equal(
      expanded.some((slot) => (slot.dateKey || "") > "2026-09-26"),
      false,
    );
  });

  it("keeps one shared slot per date after expanding a 3-week pair", () => {
    const slots: PublicPracticeSlot[] = [
      {
        id: "p-cubs",
        weekdayIndex: 1,
        weekdayName: "Monday",
        timeLabel: "5:45 PM",
        startTime: "17:45",
        ageGroup: "12U",
        teamName: "Cubs - Jones",
        teamId: "t1",
        parkName: "Tee-Joe",
        fieldName: "Berthelot",
        pairTeamName: null,
        sharedFieldGroupId: "pair-12u-w1",
        notes: "Week 1",
      },
      {
        id: "p-padres",
        weekdayIndex: 1,
        weekdayName: "Monday",
        timeLabel: "5:45 PM",
        startTime: "17:45",
        ageGroup: "12U",
        teamName: "Padres - Lott",
        teamId: "t2",
        parkName: "Tee-Joe",
        fieldName: "Berthelot",
        pairTeamName: null,
        sharedFieldGroupId: "pair-12u-w1",
        notes: "Week 1",
      },
    ];
    const collapsed = collapseSharedPracticeSlots(slots);
    const expanded = expandRotationPracticeSlots(collapsed, {
      startDate: "2026-09-06",
      endDate: "2026-10-31",
      cycleWeeks: 3,
    });
    const cubs = filterPublicPractices(expanded, { teams: ["Cubs - Jones"] });
    assert.equal(cubs.length, 3);
    assert.deepEqual(
      cubs.map((slot) => slot.dateKey),
      ["2026-09-07", "2026-09-28", "2026-10-19"],
    );
    assert.equal(cubs[0]!.pairTeamName, "Padres - Lott");
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
