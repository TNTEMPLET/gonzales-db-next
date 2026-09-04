import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDivisionCapacitySummary,
  buildFieldCapacityHeatmap,
  heatmapCellKey,
  heatmapCellLabel,
  type HeatmapPark,
} from "../fieldCapacityHeatmap";

const PARK: HeatmapPark = {
  id: "park",
  name: "Example Sports Complex",
  shortName: "ESC",
  fields: [
    { id: "f1", parkId: "park", name: "Field 1", shortName: "F1", isActive: true },
    { id: "f2", parkId: "park", name: "Field 2", shortName: "F2", isActive: true },
  ],
  availabilities: [
    {
      availabilityType: "AVAILABLE",
      date: null,
      dayOfWeek: 2,
      startTime: "18:00",
      fieldId: "f1",
      parkId: "park",
      notes: "7U CP, 8U CP",
    },
    {
      availabilityType: "AVAILABLE",
      date: null,
      dayOfWeek: 2,
      startTime: "18:00",
      fieldId: "f2",
      parkId: "park",
      notes: "7U CP, 8U CP",
    },
    {
      availabilityType: "AVAILABLE",
      date: null,
      dayOfWeek: 4,
      startTime: "18:00",
      fieldId: "f1",
      parkId: "park",
      notes: "7U CP, 8U CP",
    },
    {
      availabilityType: "AVAILABLE",
      date: null,
      dayOfWeek: 4,
      startTime: "18:00",
      fieldId: "f2",
      parkId: "park",
      notes: "7U CP, 8U CP",
    },
    {
      availabilityType: "BLACKOUT",
      date: "2026-09-10",
      dayOfWeek: null,
      startTime: "18:00",
      fieldId: "f1",
      parkId: "park",
      notes: null,
    },
  ],
};

describe("field capacity heatmap", () => {
  it("marks a placed game booked and the empty field-night open", () => {
    const grid = buildFieldCapacityHeatmap({
      parks: [PARK],
      gamesStartsOn: "2026-09-08",
      gamesEndsOn: "2026-09-10",
      games: [
        {
          fieldId: "f1",
          gameDate: "2026-09-08",
          startTime: "18:00",
          division: "7U CP",
          homeTeamName: "Yankees",
          awayTeamName: "Astros",
        },
      ],
    });

    const tueF1 = grid.cells[heatmapCellKey("2026-09-08", "18:00", "f1")];
    const tueF2 = grid.cells[heatmapCellKey("2026-09-08", "18:00", "f2")];
    const thuF1 = grid.cells[heatmapCellKey("2026-09-10", "18:00", "f1")];

    assert.equal(tueF1?.status, "booked");
    assert.equal(tueF2?.status, "open");
    assert.equal(thuF1?.status, "dark");
    assert.equal(grid.booked, 1);
    assert.equal(grid.open, 2);
    assert.match(heatmapCellLabel(tueF1!), /Yankees vs Astros/);
  });

  it("only includes nights that exist on the weekly board", () => {
    const grid = buildFieldCapacityHeatmap({
      parks: [PARK],
      gamesStartsOn: "2026-09-08",
      gamesEndsOn: "2026-09-09",
      games: [],
    });
    assert.deepEqual(
      grid.rows.map((row) => `${row.date} ${row.dayLabel}`),
      ["2026-09-08 Tue"],
    );
    assert.equal(grid.columns.length, 2);
    assert.equal(grid.booked, 0);
    assert.equal(grid.open, 2);
  });

  it("summarizes games, slotted, and still-needed by division", () => {
    const games = [
      {
        fieldId: "f1",
        gameDate: "2026-09-08",
        startTime: "18:00",
        division: "7U CP",
        homeTeamName: "Yankees",
        awayTeamName: "Astros",
      },
      {
        fieldId: null,
        gameDate: null,
        startTime: null,
        division: "7U CP",
        homeTeamName: "Cubs",
        awayTeamName: "Mets",
      },
    ];
    const grid = buildFieldCapacityHeatmap({
      parks: [PARK],
      gamesStartsOn: "2026-09-08",
      gamesEndsOn: "2026-09-10",
      games,
    });
    const rows = buildDivisionCapacitySummary({
      grid,
      games,
      teamCounts: { "7U CP": 10, "8U CP": 6 },
      gamesPerTeam: 8,
    });
    const seven = rows.find((row) => row.division === "7U CP");
    const eight = rows.find((row) => row.division === "8U CP");
    assert.equal(seven?.games, 2);
    assert.equal(seven?.slotted, 1);
    assert.equal(seven?.needed, 1);
    assert.equal(eight?.games, 24);
    assert.equal(eight?.slotted, 0);
    assert.equal(eight?.needed, 24);
    assert.ok((seven?.boardSlots ?? 0) > 0);
    assert.equal(seven?.boardSlots, eight?.boardSlots);
  });
});
