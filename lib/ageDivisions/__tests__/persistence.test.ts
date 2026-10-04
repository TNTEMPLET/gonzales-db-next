import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { shiftIsoDateByYears } from "../compute";
import { leagueDivisionDefaults } from "../defaults";
import {
  DIVISION_AGES_SAVE_NOT_READY,
  DIVISION_AGES_STORAGE_NOTE,
  clearSeasonDivisionAges,
  copyFromSeason,
  getLeagueDefaults,
  getSeasonDivisionAges,
  saveLeagueDefaults,
  saveSeasonDivisionAges,
  type DivisionAgeDb,
  type LeagueDefaultsRow,
} from "../persistence";

const ORG = "gonzales" as const;
const CUTOFF = { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 };
const NOW = new Date("2026-10-03T18:00:00.000Z");

function division(overrides: Record<string, unknown> = {}) {
  return {
    code: "7U",
    label: "7U",
    minAge: 7,
    maxAge: 7,
    sortOrder: 1,
    ...overrides,
  };
}

function memoryDb() {
  const leagues = new Map<string, LeagueDefaultsRow>();
  const seasons = new Map<string, unknown | null>();
  let failCode: string | null = null;
  const db: DivisionAgeDb = {
    async findLeagueDefaults(organizationId) {
      if (failCode) throw { code: failCode };
      return leagues.get(organizationId) ?? null;
    },
    async saveLeagueDefaults(input) {
      if (failCode) throw { code: failCode };
      const row: LeagueDefaultsRow = {
        ...input,
        updatedAt: NOW,
        updatedByAdminId: input.updatedByAdminId,
      };
      leagues.set(input.organizationId, row);
      return row;
    },
    async findSeasonDivisionAges(organizationId, seasonYear) {
      if (failCode) throw { code: failCode };
      const key = `${organizationId}:${seasonYear}`;
      return seasons.has(key) ? seasons.get(key) ?? null : null;
    },
    async saveSeasonDivisionAges(organizationId, seasonYear, divisionAgesJson) {
      if (failCode) throw { code: failCode };
      seasons.set(`${organizationId}:${seasonYear}`, divisionAgesJson);
    },
  };
  return {
    db,
    leagues,
    seasons,
    fail(code: string | null) {
      failCode = code;
    },
  };
}

describe("division age resolve order", () => {
  it("uses the season table, then league defaults, then built-in defaults", async () => {
    const memory = memoryDb();
    const league = await saveLeagueDefaults(
      memory.db,
      ORG,
      {
        cutoffMonth: 8,
        cutoffDay: 31,
        yearOffset: 0,
        divisions: [division({ code: "LEAGUE", label: "League only" })],
      },
      "admin-1",
    );
    assert.equal(league.ok, true);

    const season = await saveSeasonDivisionAges(
      memory.db,
      ORG,
      2027,
      {
        cutoff: CUTOFF,
        divisions: [division({ code: "SEASON", label: "Season only", oldestBirthdate: "2019-01-01" })],
        confirm: false,
      },
      "admin-2",
      { now: NOW },
    );
    assert.equal(season.ok, true);
    if (!season.ok) return;
    assert.equal(season.value.source, "season");
    assert.equal(season.value.updatedByAdminId, "admin-2");
    assert.equal(season.value.divisions[0]?.oldestBirthdate, "2019-01-01");

    const saved = await getSeasonDivisionAges(memory.db, ORG, 2027);
    assert.equal(saved.source, "season");
    assert.equal(saved.divisions[0]?.code, "SEASON");
    assert.equal(saved.divisions[0]?.oldestBirthdate, "2019-01-01");

    memory.seasons.set("gonzales:2027", null);
    const fromLeague = await getSeasonDivisionAges(memory.db, ORG, 2027);
    assert.equal(fromLeague.source, "league");
    assert.equal(fromLeague.divisions[0]?.code, "LEAGUE");
    assert.equal(fromLeague.cutoff.cutoffMonth, 8);

    memory.leagues.delete(ORG);
    const builtin = await getSeasonDivisionAges(memory.db, ORG, 2027);
    assert.equal(builtin.source, "builtin");
    assert.equal(builtin.cutoff.cutoffMonth, leagueDivisionDefaults(ORG).rule.cutoffMonth);
    assert.equal(builtin.storageReady, true);
    assert.equal(builtin.storageNote, null);
  });

  it("falls back on P2021 and P2022 without throwing", async () => {
    const memory = memoryDb();
    memory.fail("P2021");
    const read = await getSeasonDivisionAges(memory.db, ORG, 2027);
    assert.equal(read.source, "builtin");
    assert.equal(read.storageReady, false);
    assert.equal(read.storageNote, DIVISION_AGES_STORAGE_NOTE);
    assert.match(read.storageNote, /Settings storage not ready/);

    const league = await getLeagueDefaults(memory.db, ORG);
    assert.equal(league.storageReady, false);
    assert.match(league.storageNote ?? "", /Settings storage not ready/);

    memory.fail("P2022");
    const saved = await saveSeasonDivisionAges(
      memory.db,
      ORG,
      2027,
      { cutoff: CUTOFF, divisions: [division()], confirm: true },
      "admin-3",
      { now: NOW },
    );
    assert.equal(saved.ok, false);
    if (!saved.ok) {
      assert.equal(saved.status, 503);
      assert.equal(saved.error, DIVISION_AGES_SAVE_NOT_READY);
    }
    const defaultsSaved = await saveLeagueDefaults(
      memory.db,
      ORG,
      { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0, divisions: [division()] },
      "admin-3",
    );
    assert.equal(defaultsSaved.ok, false);
  });
});

describe("start from last season", () => {
  it("shifts overridden dates forward one year, including Feb 29", async () => {
    assert.equal(shiftIsoDateByYears("2024-02-29", 1), "2025-02-28");
    assert.equal(shiftIsoDateByYears("2024-02-29", 4), "2028-02-29");

    const memory = memoryDb();
    const saved = await saveSeasonDivisionAges(
      memory.db,
      ORG,
      2026,
      {
        cutoff: CUTOFF,
        divisions: [
          division({ oldestBirthdate: "2024-02-29", youngestBirthdate: "2024-06-01" }),
          division({ code: "8U", label: "8U", minAge: 8, maxAge: 8, sortOrder: 2 }),
        ],
        confirm: true,
      },
      "admin-4",
      { now: NOW, confirmation: "set" },
    );
    assert.equal(saved.ok, true);

    const copied = await copyFromSeason(memory.db, ORG, 2026, 2027, "admin-5", NOW);
    assert.equal(copied.ok, true);
    if (!copied.ok) return;
    assert.equal(copied.value.source, "season");
    assert.equal(copied.value.divisions[0]?.code, "7U");
    assert.equal(copied.value.divisions[0]?.oldestBirthdate, "2025-02-28");
    assert.equal(copied.value.divisions[0]?.youngestBirthdate, "2025-06-01");
    assert.equal(copied.value.divisions[1]?.oldestBirthdate, undefined);
    assert.equal(copied.value.confirmedAt, null);
    assert.equal(copied.value.updatedByAdminId, "admin-5");

    const missing = await copyFromSeason(memory.db, ORG, 2020, 2027, "admin-5", NOW);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.error, /No saved division ages for 2020/);
  });

  it("clears a saved season back to league defaults", async () => {
    const memory = memoryDb();
    await saveLeagueDefaults(
      memory.db,
      ORG,
      { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0, divisions: [division({ code: "LEAGUE", label: "League" })] },
      "admin-1",
    );
    await saveSeasonDivisionAges(
      memory.db,
      ORG,
      2027,
      { cutoff: CUTOFF, divisions: [division({ code: "SEASON", label: "Season" })], confirm: false },
      "admin-2",
      { now: NOW },
    );
    const cleared = await clearSeasonDivisionAges(memory.db, ORG, 2027, "admin-6");
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal(cleared.value.source, "league");
    assert.equal(cleared.value.divisions[0]?.code, "LEAGUE");
    assert.equal(memory.seasons.get("gonzales:2027"), null);
  });
});

describe("league roster bounds", () => {
  it("stores optional roster size inside divisionsJson and still reads the old shape", async () => {
    const memory = memoryDb();
    const saved = await saveLeagueDefaults(
      memory.db,
      ORG,
      {
        cutoffMonth: 4,
        cutoffDay: 30,
        yearOffset: 0,
        divisions: [division({ rosterMin: 10, rosterMax: 14 })],
      },
      "admin-roster",
    );
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.value.divisions[0]?.rosterMin, 10);
    assert.equal(saved.value.divisions[0]?.rosterMax, 14);
    assert.equal(saved.value.updatedByAdminId, "admin-roster");

    const raw = memory.leagues.get(ORG);
    const storedDivisions = raw?.divisionsJson as Array<Record<string, unknown>>;
    assert.equal(storedDivisions[0]?.rosterMin, 10);
    assert.equal(storedDivisions[0]?.rosterMax, 14);

    const again = await getLeagueDefaults(memory.db, ORG);
    assert.equal(again.divisions[0]?.rosterMin, 10);
    assert.equal(again.divisions[0]?.rosterMax, 14);

    memory.leagues.set(ORG, {
      ...raw!,
      divisionsJson: [division()],
    });
    const oldShape = await getLeagueDefaults(memory.db, ORG);
    assert.equal(oldShape.source, "league");
    assert.equal(oldShape.divisions[0]?.code, "7U");
    assert.equal(oldShape.divisions[0]?.rosterMin, undefined);
    assert.equal(oldShape.divisions[0]?.rosterMax, undefined);
  });
});

describe("division age store wiring", () => {
  it("upserts only divisionAgesJson and gates every route", () => {
    const store = readFileSync(new URL("../store.ts", import.meta.url), "utf8");
    assert.match(store, /update:\s*\{[\s\S]*divisionAgesJson/);
    assert.doesNotMatch(store, /umpirePayJson|parishRegistrationFeeCents/);

    const guard = readFileSync(
      new URL("../../../app/api/admin/division-ages/guard.ts", import.meta.url),
      "utf8",
    );
    assert.match(guard, /ensureAdminModule\(request, "DIVISION_AGES"\)/);
    assert.match(guard, /resolveAdminTargetOrg/);
    assert.match(guard, /gateDivisionAges/);

    for (const file of ["defaults/route.ts", "season/route.ts", "copy/route.ts"]) {
      const source = readFileSync(new URL(`../../../app/api/admin/division-ages/${file}`, import.meta.url), "utf8");
      assert.match(source, /guardDivisionAges/);
      assert.doesNotMatch(source, /TeamPlayer|Enrollment/);
    }
    const season = readFileSync(
      new URL("../../../app/api/admin/division-ages/season/route.ts", import.meta.url),
      "utf8",
    );
    const copy = readFileSync(
      new URL("../../../app/api/admin/division-ages/copy/route.ts", import.meta.url),
      "utf8",
    );
    const defaults = readFileSync(
      new URL("../../../app/api/admin/division-ages/defaults/route.ts", import.meta.url),
      "utf8",
    );
    assert.match(season, /guardDivisionAges\(request, false\)/);
    assert.match(season, /guardDivisionAges\(request, true\)/);
    assert.match(defaults, /guardDivisionAges\(request, false\)/);
    assert.match(defaults, /guardDivisionAges\(request, true\)/);
    assert.match(copy, /guardDivisionAges\(request, true\)/);
  });
});
