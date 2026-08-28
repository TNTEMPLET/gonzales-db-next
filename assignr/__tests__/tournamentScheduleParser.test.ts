import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import * as XLSX from "xlsx";

import {
  ASSIGNR_GAMES_IMPORT_HEADERS,
  fieldMappingKey,
} from "@/lib/assignr/gamesImportTypes";
import { buildAssignrGamesCsvFromDrafts } from "@/lib/assignr/gamesImportCsv";
import {
  parseTournamentScheduleGrid,
  sheetToGrid,
} from "@/lib/assignr/tournamentScheduleParser";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(fixtureDir, "../__fixtures__/eoy-tourney-schedule.csv");

function loadFixtureGrid() {
  const workbook = XLSX.read(readFileSync(fixturePath), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0] || ""];
  assert.ok(sheet);
  return sheetToGrid(sheet);
}

test("parses Tee Joe tournament blocks from the EoY fixture", () => {
  const drafts = parseTournamentScheduleGrid(loadFixtureGrid(), 2026);
  const teeJoeGames = drafts.filter((draft) => draft.sourcePark === "TEEJOE");

  assert.equal(teeJoeGames.length, 27);
  assert.ok(
    teeJoeGames.some(
      (draft) =>
        draft.sourceTournament === "9 Year Old Diamond City Tournament" &&
        draft.homeTeam === "7 Seed" &&
        draft.awayTeam === "10 Seed",
    ),
  );
});

test("parses Stevens numeric fields from the EoY fixture", () => {
  const drafts = parseTournamentScheduleGrid(loadFixtureGrid(), 2026);
  const stevensGames = drafts.filter((draft) => draft.sourcePark === "STEVENS");

  assert.ok(stevensGames.length > 0);
  assert.ok(
    stevensGames.some(
      (draft) => draft.sourceField === "3" && draft.sourceGameNumber === "1",
    ),
  );
  assert.ok(
    stevensGames.some(
      (draft) => draft.sourceField === "Stevens 5" && draft.homeTeam === "2 Seed",
    ),
  );
});

test("builds Assignr CSV with the sample header order", () => {
  const drafts = parseTournamentScheduleGrid(loadFixtureGrid(), 2026).slice(0, 1);
  const { csv } = buildAssignrGamesCsvFromDrafts(
    drafts,
    {
      ageGroupMappings: {
        "9 Year Old Diamond City Tournament": "9U DYB",
      },
      parkMappings: {
        TEEJOE: "Tee-Joe Park",
      },
      fieldMappings: {
        [fieldMappingKey("TEEJOE", "Aldridge (1)")]: "Aldridge 1",
      },
    },
    2026,
  );

  const [headerLine, rowLine] = csv.trim().split("\n");
  assert.equal(headerLine, ASSIGNR_GAMES_IMPORT_HEADERS.join(","));
  assert.match(rowLine, /May 18 2026/);
  assert.match(rowLine, /5:45 PM/);
  assert.match(rowLine, /9U DYB/);
});
