import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";

import { ASSIGNR_GAMES_IMPORT_HEADERS } from "@/lib/assignr/gamesImportTypes";
import { exportVendorWorkbook, type SchedulerExportGame } from "../export";
import { assignrUmpirePattern } from "../umpirePattern";

describe("assignrUmpirePattern", () => {
  it("maps Fall Ball divisions to Assignr Pattern names", () => {
    assert.equal(assignrUmpirePattern("4U TB"), "0 Umpires");
    assert.equal(assignrUmpirePattern("5U TB"), "0 Umpires");
    assert.equal(assignrUmpirePattern("6U MOD"), "2 Umpires");
    assert.equal(assignrUmpirePattern("7U CP"), "2 Umpires");
    assert.equal(assignrUmpirePattern("8U CP"), "2 Umpires");
    assert.equal(assignrUmpirePattern("9U"), "1 Umpire");
    assert.equal(assignrUmpirePattern("10U"), "1 Umpire");
    assert.equal(assignrUmpirePattern("12U"), "1 Umpire");
    assert.equal(assignrUmpirePattern("15U"), "1 Umpire");
    assert.equal(assignrUmpirePattern("17U"), "2 Umpires");
    assert.equal(assignrUmpirePattern("Umpire Clinic"), "");
  });
});

describe("exportVendorWorkbook Assignr Pattern", () => {
  it("writes Pattern on the Assignr sheet from division", () => {
    const games: SchedulerExportGame[] = [
      {
        gameNumber: 1,
        gameDate: new Date(Date.UTC(2026, 9, 6)),
        startTime: "18:00",
        endTime: "19:15",
        division: "8U CP",
        ageGroup: "8U CP",
        homeTeamName: "Astros",
        awayTeamName: "Yankees",
        park: { name: "J Leo Stevens Park", shortName: "JLS" },
        field: { name: "Field 3", shortName: "3" },
        status: "DRAFT",
        conflictFlags: [],
        schedulerNotes: null,
      },
      {
        gameNumber: 2,
        gameDate: new Date(Date.UTC(2026, 9, 6)),
        startTime: "17:45",
        endTime: "19:15",
        division: "4U TB",
        ageGroup: "4U TB",
        homeTeamName: "Tigers",
        awayTeamName: "Cubs",
        park: { name: "J Leo Stevens Park", shortName: "JLS" },
        field: { name: "Field 1", shortName: "1" },
        status: "DRAFT",
        conflictFlags: [],
        schedulerNotes: null,
      },
    ];
    const buffer = exportVendorWorkbook(games, { leagueName: "AP Fall Ball" });
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets.Assignr;
    assert.ok(sheet);
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false }) as string[][];
    assert.deepEqual(rows[0], [...ASSIGNR_GAMES_IMPORT_HEADERS]);
    const patternIndex = ASSIGNR_GAMES_IMPORT_HEADERS.indexOf("Pattern");
    assert.equal(rows[1]?.[patternIndex], "2 Umpires");
    assert.equal(rows[2]?.[patternIndex], "0 Umpires");
  });

  it("splits SportsConnect into one sheet per division", () => {
    const games: SchedulerExportGame[] = [
      {
        gameNumber: 1,
        gameDate: new Date(Date.UTC(2026, 9, 6)),
        startTime: "18:00",
        endTime: "19:15",
        division: "8U CP",
        ageGroup: "8U CP",
        homeTeamName: "Astros",
        awayTeamName: "Yankees",
        park: { name: "J Leo Stevens Park", shortName: "JLS" },
        field: { name: "Field 3", shortName: "3" },
        status: "DRAFT",
        conflictFlags: [],
        schedulerNotes: null,
      },
      {
        gameNumber: 2,
        gameDate: new Date(Date.UTC(2026, 9, 6)),
        startTime: "17:45",
        endTime: "19:15",
        division: "4U TB",
        ageGroup: "4U TB",
        homeTeamName: "Tigers",
        awayTeamName: "Cubs",
        park: { name: "J Leo Stevens Park", shortName: "JLS" },
        field: { name: "Field 1", shortName: "1" },
        status: "DRAFT",
        conflictFlags: [],
        schedulerNotes: null,
      },
    ];
    const workbook = XLSX.read(exportVendorWorkbook(games), { type: "buffer" });
    assert.deepEqual(workbook.SheetNames, ["Assignr", "4U TB", "8U CP", "GameChanger"]);
    const fourU = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["4U TB"], { header: 1, raw: true }) as unknown[][];
    const eightU = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["8U CP"], { header: 1, raw: true }) as unknown[][];
    assert.deepEqual(fourU[0], [
      "SortOrder",
      "RoundNo",
      "HomeTeam",
      "AwayTeam",
      "MatchDate",
      "StartTime",
      "EndTime",
      "Location",
      "Field",
    ]);
    assert.equal(fourU.length, 2);
    assert.equal(eightU.length, 2);
    assert.equal(fourU[1]?.[2], "Tigers");
    assert.equal(eightU[1]?.[2], "Astros");
    assert.equal(eightU[1]?.[5], "18:00");
    assert.equal(eightU[1]?.[6], "19:15");
  });
});
