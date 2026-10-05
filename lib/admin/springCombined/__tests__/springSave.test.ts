import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { SpringCombinedSaveConfirm } from "@/components/admin/SpringCombinedSavePanel";
import { calculatedRange, effectiveCutoffDate, effectiveRange } from "@/lib/ageDivisions/compute";
import {
  getSeasonDivisionAges,
  type DivisionAgeDb,
  type LeagueDefaultsRow,
  saveSpringCombinedSeasons,
  undoSpringCombinedSeasons,
  type SpringCombinedDb,
  type SpringSeasonTx,
} from "@/lib/ageDivisions/persistence";
import { validateSeasonRecord } from "@/lib/ageDivisions/schema";
import type { DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";

import {
  buildUndoRecords,
  combinedSavePreview,
  splitCombinedTable,
  springCombinedSaveDenial,
  type SpringLeagueTable,
} from "../save";
import { combinedForecastConfig } from "../view";

const SEASON = 2027;
const DYB: LeagueAgeRule = { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 };
const LL: LeagueAgeRule = { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 };

function division(overrides: Partial<DivisionAgeConfig> & Pick<DivisionAgeConfig, "code" | "minAge" | "maxAge">): DivisionAgeConfig {
  return {
    label: overrides.label ?? overrides.code,
    sortOrder: overrides.sortOrder ?? 1,
    ...overrides,
  };
}

function windowFor(division: Pick<DivisionAgeConfig, "minAge" | "maxAge">, cutoff: LeagueAgeRule) {
  return calculatedRange(division, effectiveCutoffDate(cutoff, SEASON));
}

function leagues(): SpringLeagueTable[] {
  const tee = windowFor({ minAge: 4, maxAge: 6 }, DYB);
  return [
    {
      organizationId: "gonzales",
      cutoff: DYB,
      divisions: [division({ code: "8U", label: "8U", minAge: 8, maxAge: 8, sortOrder: 1 })],
    },
    {
      organizationId: "ascension",
      cutoff: LL,
      divisions: [
        division({ code: "12U", label: "12U", minAge: 12, maxAge: 12, sortOrder: 1 }),
        division({ code: "TEE", label: "Tee-ball", minAge: 4, maxAge: 6, sortOrder: 2, oldestBirthdate: tee.oldest, youngestBirthdate: tee.youngest, cutoffPreset: "dyb" }),
        division({
          code: "8U MINOR",
          label: "8U Minors",
          minAge: 8,
          maxAge: 8,
          sortOrder: 3,
          oldestBirthdate: "2018-05-01",
          youngestBirthdate: "2019-08-31",
          cutoffPreset: "custom",
        }),
        division({
          code: "7U MINOR",
          label: "7U Minors",
          minAge: 7,
          maxAge: 7,
          sortOrder: 4,
          oldestBirthdate: "2019-09-01",
          youngestBirthdate: "2020-04-30",
          cutoffPreset: "custom",
        }),
      ],
    },
  ];
}

function proposedFrom(current: readonly SpringLeagueTable[]) {
  return combinedForecastConfig(current, SEASON);
}

function memorySpring(failOn: "gonzales" | "ascension" | null = null) {
  const seasons = new Map<string, unknown | null>();
  const db: SpringCombinedDb = {
    async transaction(run) {
      const snapshot = new Map(seasons);
      const tx: SpringSeasonTx = {
        async findSeasonDivisionAges(organizationId, seasonYear) {
          const key = `${organizationId}:${seasonYear}`;
          return seasons.has(key) ? (seasons.get(key) ?? null) : null;
        },
        async saveSeasonDivisionAges(organizationId, seasonYear, divisionAgesJson) {
          if (failOn && organizationId === failOn) throw new Error("write failed");
          seasons.set(`${organizationId}:${seasonYear}`, divisionAgesJson);
        },
      };
      try {
        return await run(tx);
      } catch (error) {
        seasons.clear();
        for (const [key, value] of snapshot) seasons.set(key, value);
        throw error;
      }
    },
  };
  return { db, seasons };
}

describe("combined spring save", () => {
  it("splits by league and keeps overrides that are not the league cutoff", () => {
    const current = leagues();
    const split = splitCombinedTable(proposedFrom(current), current, SEASON);
    assert.equal(split.ok, true);
    if (!split.ok) return;
    const dyb = split.leagues.gonzales;
    const ll = split.leagues.ascension;
    assert.deepEqual(dyb.cutoff, DYB);
    assert.deepEqual(ll.cutoff, LL);
    assert.equal(dyb.divisions[0]?.code, "8U");
    assert.equal(dyb.divisions[0]?.cutoffPreset, "dyb");
    assert.equal(dyb.divisions[0]?.oldestBirthdate, undefined);
    assert.equal(dyb.divisions[0]?.youngestBirthdate, undefined);
    assert.equal(ll.divisions.some((division) => division.code === "8U"), false);

    const twelve = ll.divisions.find((division) => division.code === "12U");
    assert.equal(twelve?.label, "12U");
    assert.equal(twelve?.cutoffPreset, "little-league");
    assert.equal(twelve?.oldestBirthdate, undefined);

    const tee = ll.divisions.find((division) => division.code === "TEE");
    const teeWindow = windowFor({ minAge: 4, maxAge: 6 }, DYB);
    assert.equal(tee?.label, "Tee-ball");
    assert.equal(tee?.cutoffPreset, "dyb");
    assert.equal(tee?.oldestBirthdate, teeWindow.oldest);
    assert.equal(tee?.youngestBirthdate, teeWindow.youngest);

    const eight = ll.divisions.find((division) => division.code === "8U MINOR");
    const seven = ll.divisions.find((division) => division.code === "7U MINOR");
    assert.equal(eight?.cutoffPreset, "custom");
    assert.equal(eight?.oldestBirthdate, "2018-05-01");
    assert.equal(eight?.youngestBirthdate, "2019-08-31");
    assert.equal(seven?.cutoffPreset, "custom");
    assert.equal(seven?.oldestBirthdate, "2019-09-01");
    assert.equal(seven?.youngestBirthdate, "2020-04-30");
    const eightRange = effectiveRange(eight!, effectiveCutoffDate(LL, SEASON));
    const sevenRange = effectiveRange(seven!, effectiveCutoffDate(LL, SEASON));
    assert.equal(shiftDay(eightRange.youngest), sevenRange.oldest);
  });

  it("round-trips baked windows back to the same overrides", () => {
    const current = leagues();
    const once = splitCombinedTable(proposedFrom(current), current, SEASON);
    assert.equal(once.ok, true);
    if (!once.ok) return;
    const again = splitCombinedTable(
      combinedForecastConfig(
        [
          { organizationId: "gonzales", cutoff: once.leagues.gonzales.cutoff, divisions: once.leagues.gonzales.divisions },
          { organizationId: "ascension", cutoff: once.leagues.ascension.cutoff, divisions: once.leagues.ascension.divisions },
        ],
        SEASON,
      ),
      [
        { organizationId: "gonzales", cutoff: DYB, divisions: once.leagues.gonzales.divisions },
        { organizationId: "ascension", cutoff: LL, divisions: once.leagues.ascension.divisions },
      ],
      SEASON,
    );
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.deepEqual(again.leagues.ascension.divisions, once.leagues.ascension.divisions);
    assert.deepEqual(again.leagues.gonzales.divisions, once.leagues.gonzales.divisions);
  });

  it("rejects Fall Ball and never writes it", async () => {
    const memory = memorySpring();
    const current = leagues();
    const proposed = proposedFrom(current);
    proposed.divisions.push({
      code: "fallball:9U",
      label: "9U",
      minAge: 9,
      maxAge: 9,
      sortOrder: 99,
    });
    const saved = await saveSpringCombinedSeasons(memory.db, SEASON, proposed, current, "admin-1");
    assert.equal(saved.ok, false);
    if (!saved.ok) assert.match(saved.error, /Fall Ball/);
    assert.equal(memory.seasons.size, 0);

    const springNamed = splitCombinedTable(
      { cutoff: DYB, divisions: [{ code: "spring:9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1 }] },
      current,
      SEASON,
    );
    assert.equal(springNamed.ok, false);
  });

  it("rolls back both leagues when the second write fails", async () => {
    const memory = memorySpring("ascension");
    const originalGonzales = {
      cutoff: DYB,
      divisions: [division({ code: "8U", label: "8U", minAge: 8, maxAge: 8 })],
    };
    const originalAscension = {
      cutoff: LL,
      divisions: [division({ code: "12U", label: "12U", minAge: 12, maxAge: 12 })],
    };
    memory.seasons.set("gonzales:2027", originalGonzales);
    memory.seasons.set("ascension:2027", originalAscension);
    const current = leagues();
    const proposed = proposedFrom(current);
    const eight = proposed.divisions.find((division) => division.code === "gonzales:8U");
    assert.ok(eight);
    eight.youngestBirthdate = "2019-05-15";
    await assert.rejects(() => saveSpringCombinedSeasons(memory.db, SEASON, proposed, current, "admin-1"));
    assert.deepEqual(memory.seasons.get("gonzales:2027"), originalGonzales);
    assert.deepEqual(memory.seasons.get("ascension:2027"), originalAscension);
    assert.equal([...memory.seasons.keys()].every((key) => key.startsWith("gonzales:") || key.startsWith("ascension:")), true);
  });

  it("restores both leagues from the one-step snapshot", async () => {
    const memory = memorySpring();
    const current = leagues();
    const original = {
      cutoff: DYB,
      divisions: [division({ code: "8U", label: "8U", minAge: 8, maxAge: 8 })],
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByAdminId: "before",
    };
    memory.seasons.set("gonzales:2027", original);
    const proposed = proposedFrom(current);
    const eight = proposed.divisions.find((division) => division.code === "gonzales:8U");
    assert.ok(eight);
    eight.youngestBirthdate = "2019-05-15";
    const saved = await saveSpringCombinedSeasons(memory.db, SEASON, proposed, current, "admin-1", new Date("2026-10-05T00:00:00.000Z"));
    assert.equal(saved.ok, true);
    const gonzales = memory.seasons.get("gonzales:2027") as { previous?: { divisions?: unknown; previous?: unknown; absent?: true } };
    const ascension = memory.seasons.get("ascension:2027") as { previous?: { absent?: true; previous?: unknown } };
    assert.equal(gonzales.previous && "absent" in gonzales.previous, false);
    assert.ok(gonzales.previous && !("previous" in gonzales.previous));
    const previousDivisions = gonzales.previous && "divisions" in gonzales.previous ? gonzales.previous.divisions : null;
    assert.equal(Array.isArray(previousDivisions) && previousDivisions[0]?.code, "8U");
    assert.equal(Array.isArray(previousDivisions) && previousDivisions[0]?.youngestBirthdate, undefined);
    assert.equal(ascension.previous?.absent, true);
    assert.equal(ascension.previous && "previous" in ascension.previous, false);

    const undone = await undoSpringCombinedSeasons(memory.db, SEASON, "admin-1");
    assert.equal(undone.ok, true);
    const restored = memory.seasons.get("gonzales:2027") as { divisions: DivisionAgeConfig[]; previous?: unknown };
    assert.equal(restored.divisions[0]?.youngestBirthdate, undefined);
    assert.equal(restored.previous, undefined);
    assert.equal(memory.seasons.get("ascension:2027"), null);

    const second = await undoSpringCombinedSeasons(memory.db, SEASON, "admin-1");
    assert.equal(second.ok, false);
    if (!second.ok) assert.match(second.error, /not available/);
    assert.equal(memory.seasons.get("ascension:2027"), null);
  });

  it("refuses undo when one league has no snapshot and writes nothing", () => {
    const stored = {
      gonzales: { cutoff: DYB, divisions: [division({ code: "8U", minAge: 8, maxAge: 8 })] },
      ascension: { cutoff: LL, divisions: [division({ code: "12U", minAge: 12, maxAge: 12 })] },
    };
    const built = buildUndoRecords(stored, SEASON);
    assert.equal(built.ok, false);
  });

  it("allows only a master on the master site", () => {
    assert.equal(springCombinedSaveDenial({ authenticated: false, isMaster: false, masterDeployment: true })?.status, 401);
    assert.equal(springCombinedSaveDenial({ authenticated: true, isMaster: false, masterDeployment: true })?.status, 403);
    assert.equal(springCombinedSaveDenial({ authenticated: true, isMaster: true, masterDeployment: false })?.status, 403);
    assert.equal(springCombinedSaveDenial({ authenticated: true, isMaster: true, masterDeployment: true }), null);
  });

  it("loads older season JSON that has no cutoffPreset", async () => {
    const seasons = new Map<string, unknown | null>();
    seasons.set("gonzales:2027", {
      cutoff: DYB,
      divisions: [{ code: "9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1 }],
    });
    const db: DivisionAgeDb = {
      async findLeagueDefaults() {
        return null;
      },
      async saveLeagueDefaults(input) {
        return { ...input, updatedAt: new Date(), updatedByAdminId: input.updatedByAdminId } as LeagueDefaultsRow;
      },
      async findSeasonDivisionAges(organizationId, seasonYear) {
        return seasons.get(`${organizationId}:${seasonYear}`) ?? null;
      },
      async saveSeasonDivisionAges() {
        throw new Error("read-only test");
      },
    };
    const loaded = await getSeasonDivisionAges(db, "gonzales", SEASON);
    assert.equal(loaded.source, "season");
    assert.equal(loaded.divisions[0]?.code, "9U");
    assert.equal(loaded.divisions[0]?.cutoffPreset, undefined);
    assert.notEqual(loaded.undoAvailable, true);

    const withPreset = validateSeasonRecord(
      {
        cutoff: LL,
        divisions: [
          {
            code: "8U MINOR",
            label: "8U Minors",
            minAge: 8,
            maxAge: 8,
            sortOrder: 1,
            oldestBirthdate: "2018-05-01",
            youngestBirthdate: "2019-08-31",
            cutoffPreset: "custom",
          },
        ],
      },
      SEASON,
    );
    assert.equal(withPreset.ok, true);
    if (!withPreset.ok) return;
    assert.equal(withPreset.data.divisions[0]?.cutoffPreset, "custom");

    const brokenPrevious = validateSeasonRecord(
      {
        cutoff: DYB,
        divisions: [{ code: "9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1 }],
        previous: { nope: true },
      },
      SEASON,
    );
    assert.equal(brokenPrevious.ok, true);
    if (!brokenPrevious.ok) return;
    assert.equal(brokenPrevious.data.previous, undefined);
  });

  it("shows a before and after for each league", () => {
    const current = leagues();
    const proposed = proposedFrom(current);
    const eight = proposed.divisions.find((division) => division.code === "gonzales:8U");
    assert.ok(eight);
    eight.youngestBirthdate = "2019-05-15";
    const preview = combinedSavePreview(current, proposed, SEASON);
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.equal(preview.preview.leagues[0]?.title, "Gonzales DYB");
    assert.equal(preview.preview.leagues[1]?.title, "Ascension LL");
    assert.match(preview.preview.leagues[0]?.cutoffText ?? "", /Apr 30/);
    assert.match(preview.preview.leagues[1]?.cutoffText ?? "", /Aug 31/);
    assert.equal(preview.preview.leagues[0]?.changes.length, 1);
    assert.equal(preview.preview.leagues[1]?.changes.length, 0);
    const html = renderToStaticMarkup(
      createElement(SpringCombinedSaveConfirm, {
        preview: preview.preview,
        saving: false,
        error: null,
        onSave: () => {},
        onBack: () => {},
      }),
    );
    assert.match(html, /data-testid="spring-save-confirm"/);
    assert.match(html, /Gonzales DYB/);
    assert.match(html, /Ascension LL/);
    assert.match(html, /Now/);
    assert.match(html, /After save/);
    assert.match(html, /Fall Ball is not changed/);
    assert.match(html, /Save both leagues/);
    assert.match(html, /No division changes/);
  });

  it("keeps the blanket 403 on every other spring write", () => {
    const route = readFileSync(new URL("../../../../app/api/admin/division-ages/spring/route.ts", import.meta.url), "utf8");
    assert.match(route, /springCombinedSaveDenial/);
    assert.match(route, /isMasterAdminActor/);
    assert.doesNotMatch(route, /springCombinedRequestBlock/);
    assert.doesNotMatch(route, /fallball/);
    assert.match(route, /organizationIds: \["gonzales", "ascension"\]/);

    const store = readFileSync(new URL("../../../ageDivisions/store.ts", import.meta.url), "utf8");
    assert.match(store, /prisma\.\$transaction/);
    const transaction = store.slice(store.indexOf("const springDb"), store.indexOf("export function saveSpringCombinedDivisionAges"));
    assert.match(transaction, /organizationId/);
    assert.doesNotMatch(transaction, /fallball/);

    const persistence = readFileSync(new URL("../../../ageDivisions/persistence.ts", import.meta.url), "utf8");
    const writer = persistence.slice(persistence.indexOf("export async function saveSpringCombinedSeasons"));
    assert.match(writer, /for \(const org of SPRING_LEAGUE_ORGS\)/);
    assert.doesNotMatch(writer, /fallball/);

    const guard = readFileSync(new URL("../../../../app/api/admin/division-ages/guard.ts", import.meta.url), "utf8");
    assert.match(guard, /springCombinedRequestBlock/);
    const season = readFileSync(new URL("../../../../app/api/admin/division-ages/season/route.ts", import.meta.url), "utf8");
    assert.match(season, /guardDivisionAges/);
  });
});

function shiftDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
