import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { DivisionAgesBuilder } from "@/components/admin/DivisionAgesBuilder";
import { DivisionAgesModeTabs } from "@/components/admin/DivisionAgesExplorer";
import { effectiveRange } from "../compute";
import { DYB_RULE } from "../forecast";
import { effectiveCutoffDate } from "../compute";
import {
  addBuilderRow,
  blankBuilderTable,
  builderBackupKey,
  builderCoverageIssues,
  builderForecastProposed,
  builderOverlapRowIds,
  builderRowWindow,
  builderStorageKey,
  clearBuilderTable,
  classifyBuilderRaw,
  insertBuilderRow,
  loadBuilderTable,
  moveBuilderRow,
  newBuilderRow,
  parseBuilderTable,
  patchForCharterChange,
  removeBuilderRow,
  saveBuilderTable,
  serializeBuilderTable,
  startOverBuilderTable,
  updateBuilderRow,
  type BuilderRow,
  type BuilderTable,
  type KeyValueStore,
} from "../divisionBuilder";

const SEASON = 2027;

function row(id: string, patch: Partial<Omit<BuilderRow, "id">>): BuilderRow {
  return newBuilderRow(id, patch);
}

function tableWith(rows: BuilderRow[], organizationId = "gonzales", seasonYear = SEASON): BuilderTable {
  return { version: 1, organizationId, seasonYear, rows };
}

function memoryStore(seed: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

describe("division builder rows", () => {
  it("starts blank and adds, edits, reorders, and removes divisions", () => {
    const blank = blankBuilderTable("gonzales", SEASON);
    assert.deepEqual(blank.rows, []);

    const added = addBuilderRow(blank, { name: "8U Minors", minAge: 8, maxAge: 8, charter: "ll" }, "minors");
    const both = addBuilderRow(
      added,
      { name: "9U", minAge: 9, maxAge: 9, charter: "dyb", cutoff: "dyb" },
      "nine",
    );
    assert.deepEqual(blank.rows, []);
    assert.deepEqual(
      both.rows.map((item) => item.id),
      ["minors", "nine"],
    );

    const edited = updateBuilderRow(both, "minors", { name: "8U Minor", maxAge: 8, charter: "both" });
    assert.equal(edited.rows[0]?.name, "8U Minor");
    assert.equal(edited.rows[0]?.charter, "both");
    assert.equal(both.rows[0]?.name, "8U Minors");

    const moved = moveBuilderRow(edited, "nine", "up");
    assert.deepEqual(
      moved.rows.map((item) => item.id),
      ["nine", "minors"],
    );
    const stuck = moveBuilderRow(moved, "nine", "up");
    assert.deepEqual(
      stuck.rows.map((item) => item.id),
      ["nine", "minors"],
    );

    const removed = removeBuilderRow(moved, "minors");
    assert.deepEqual(
      removed.rows.map((item) => item.id),
      ["nine"],
    );
    const missing = removeBuilderRow(removed, "nope");
    assert.equal(missing.rows.length, 1);
    assert.equal(updateBuilderRow(removed, "nope", { name: "x" }).rows[0]?.name, "9U");
  });

  it("clears every division and keeps the league and season", () => {
    const next = startOverBuilderTable(
      tableWith([row("a", { name: "Tee-ball", minAge: 5, maxAge: 6, charter: "teeball" })]),
    );
    assert.deepEqual(next.rows, []);
    assert.equal(next.organizationId, "gonzales");
    assert.equal(next.seasonYear, SEASON);
  });
});

describe("per-row cutoff windows", () => {
  it("derives the Little League window for 7U in 2027", () => {
    const window = builderRowWindow(
      row("ll7", { name: "7U Minors", minAge: 7, maxAge: 7, charter: "ll", cutoff: "little-league" }),
      SEASON,
    );
    assert.equal(window.cutoffIso, "2027-08-31");
    assert.equal(window.oldest, "2019-09-01");
    assert.equal(window.youngest, "2020-08-31");
    assert.equal(window.label, "born Sep 1, 2019 – Aug 31, 2020");
    assert.equal(window.oldestOverridden, false);
  });

  it("derives the Dixie/Diamond window and a custom window on other rows", () => {
    const dyb = builderRowWindow(
      row("dyb9", { name: "9U", minAge: 9, maxAge: 9, charter: "dyb", cutoff: "dyb" }),
      SEASON,
    );
    assert.equal(dyb.cutoffIso, "2027-04-30");
    assert.equal(dyb.oldest, "2017-05-01");
    assert.equal(dyb.youngest, "2018-04-30");
    assert.match(dyb.label, /^born May 1, 2017 – Apr 30, 2018$/);

    const custom = builderRowWindow(
      row("custom", {
        name: "10U",
        minAge: 10,
        maxAge: 10,
        cutoff: "custom",
        customMonth: 7,
        customDay: 15,
      }),
      2026,
    );
    assert.equal(custom.cutoffIso, "2026-07-15");
    assert.equal(custom.oldest, "2015-07-16");
    assert.equal(custom.youngest, "2016-07-15");
  });

  it("uses a later cutoff year when the row offset is +1", () => {
    const window = builderRowWindow(
      row("fall", { name: "10U", minAge: 10, maxAge: 10, cutoff: "dyb", yearOffset: 1 }),
      2026,
    );
    assert.equal(window.cutoffIso, "2027-04-30");
    assert.equal(window.oldest, "2016-05-01");
    assert.equal(window.youngest, "2017-04-30");
  });

  it("lets a birthdate override replace the calculated day", () => {
    const window = builderRowWindow(
      row("override", {
        name: "10U",
        minAge: 10,
        maxAge: 10,
        cutoff: "custom",
        customMonth: 7,
        customDay: 15,
        youngestOverride: "2016-07-01",
      }),
      2026,
    );
    assert.equal(window.youngest, "2016-07-01");
    assert.equal(window.youngestOverridden, true);
    assert.match(window.label, /using your override/);
  });

  it("pulls an impossible custom day back to the end of the month", () => {
    const window = builderRowWindow(
      row("feb", { name: "6U", minAge: 6, maxAge: 6, cutoff: "custom", customMonth: 2, customDay: 31 }),
      2027,
    );
    assert.equal(window.cutoffClamped, true);
    assert.equal(window.cutoffIso, "2027-02-28");
  });
});

describe("gap and overlap detection", () => {
  it("stays quiet when Little League ages sit next to each other", () => {
    const issues = builderCoverageIssues(
      tableWith([
        row("seven", { name: "7U Minors", minAge: 7, maxAge: 7, charter: "ll", cutoff: "little-league" }),
        row("eight", { name: "8U Minors", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
      ]),
    );
    assert.deepEqual(issues, []);
  });

  it("does not treat a Little League row and a Diamond row as one chart", () => {
    const sideBySide = tableWith([
      row("eight", { name: "8U Minors", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
      row("nine", { name: "9U", minAge: 9, maxAge: 9, charter: "dyb", cutoff: "dyb" }),
      row("dyb8", { name: "8U DYB", minAge: 8, maxAge: 8, charter: "dyb", cutoff: "dyb" }),
    ]);
    const issues = builderCoverageIssues(sideBySide);
    assert.deepEqual(
      issues.filter((issue) => issue.kind === "gap" || issue.kind === "overlap"),
      [],
    );
    assert.deepEqual(builderOverlapRowIds(sideBySide), []);
  });

  it("flags a hole inside one league", () => {
    const issues = builderCoverageIssues(
      tableWith([
        row("eight", { name: "8U Minors", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
        row("ten", { name: "10U", minAge: 10, maxAge: 10, charter: "ll", cutoff: "little-league" }),
        row("dyb", { name: "9U", minAge: 9, maxAge: 9, charter: "dyb", cutoff: "dyb" }),
      ]),
    );
    const gap = issues.find((issue) => issue.kind === "gap");
    assert.ok(gap);
    assert.match(gap.message, /Little League/);
    assert.match(gap.message, /Gap/);
    assert.match(gap.message, /Sep 1, 2017/);
    assert.match(gap.message, /Aug 31, 2018/);
    assert.deepEqual(gap.rowIds.sort(), ["eight", "ten"]);
  });

  it("flags two Little League rows that cover the same birthdays and leaves Diamond out", () => {
    const issues = builderCoverageIssues(
      tableWith([
        row("ll-a", { name: "8U LL", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
        row("ll-b", { name: "8U LL again", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
        row("dyb", { name: "8U DYB", minAge: 8, maxAge: 8, charter: "dyb", cutoff: "dyb" }),
      ]),
    );
    const overlaps = issues.filter((issue) => issue.kind === "overlap");
    assert.equal(overlaps.length, 1);
    const overlap = overlaps[0]!;
    assert.match(overlap.message, /Little League/);
    assert.match(overlap.message, /8U LL/);
    assert.match(overlap.message, /8U LL again/);
    assert.doesNotMatch(overlap.message, /8U DYB/);
    assert.deepEqual(overlap.rowIds.sort(), ["ll-a", "ll-b"]);
    assert.deepEqual(builderOverlapRowIds(tableWith([
      row("ll-a", { name: "8U LL", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
      row("ll-b", { name: "8U LL again", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
      row("dyb", { name: "8U DYB", minAge: 8, maxAge: 8, charter: "dyb", cutoff: "dyb" }),
    ])).sort(), ["ll-a", "ll-b"]);
  });

  it("checks a Both leagues row inside Little League and inside Diamond", () => {
    const issues = builderCoverageIssues(
      tableWith([
        row("ll", { name: "8U LL", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
        row("both", { name: "8U Both", minAge: 8, maxAge: 8, charter: "both", cutoff: "little-league" }),
        row("dyb", { name: "8U DYB", minAge: 8, maxAge: 8, charter: "dyb", cutoff: "dyb" }),
      ]),
    );
    const overlaps = issues.filter((issue) => issue.kind === "overlap");
    const little = overlaps.find((issue) => issue.message.startsWith("Little League"));
    const diamond = overlaps.find((issue) => issue.message.startsWith("Diamond / Dixie"));
    assert.ok(little);
    assert.ok(diamond);
    assert.deepEqual(little.rowIds.sort(), ["both", "ll"]);
    assert.deepEqual(diamond.rowIds.sort(), ["both", "dyb"]);
    assert.equal(overlaps.some((issue) => issue.rowIds.includes("ll") && issue.rowIds.includes("dyb")), false);
  });

  it("accepts a side-by-side Little League and Diamond chart", () => {
    const rows: BuilderRow[] = [
      row("tee", { name: "Tee-ball", minAge: 4, maxAge: 5, charter: "teeball", cutoff: "little-league" }),
    ];
    for (let age = 6; age <= 12; age += 1) {
      rows.push(row(`ll-${age}`, { name: `${age}U LL`, minAge: age, maxAge: age, charter: "ll", cutoff: "little-league" }));
      rows.push(row(`dyb-${age}`, { name: `${age}U DYB`, minAge: age, maxAge: age, charter: "dyb", cutoff: "dyb" }));
    }
    rows.push(row("dyb-13", { name: "13-14 DYB", minAge: 13, maxAge: 14, charter: "dyb", cutoff: "dyb" }));
    rows.push(row("dyb-15", { name: "15-17 DYB", minAge: 15, maxAge: 17, charter: "dyb", cutoff: "dyb" }));
    const issues = builderCoverageIssues(tableWith(rows));
    assert.deepEqual(
      issues.filter((issue) => issue.kind === "gap" || issue.kind === "overlap"),
      [],
    );
    assert.deepEqual(builderOverlapRowIds(tableWith(rows)), []);
  });

  it("names a division that still needs a name", () => {
    const issues = builderCoverageIssues(tableWith([row("blank", { name: "", minAge: 6, maxAge: 6 })]));
    assert.equal(issues[0]?.kind, "incomplete");
    assert.match(issues[0]?.message ?? "", /Name this division/);
  });
});

describe("league cutoff defaults", () => {
  it("moves Aug 31 to Apr 30 when the league changes and the cutoff was still the default", () => {
    const little = row("a", { charter: "ll", cutoff: "little-league" });
    assert.deepEqual(patchForCharterChange(little, "dyb"), { charter: "dyb", cutoff: "dyb" });
    const diamond = row("b", { charter: "dyb", cutoff: "dyb" });
    assert.deepEqual(patchForCharterChange(diamond, "ll"), { charter: "ll", cutoff: "little-league" });
  });

  it("leaves a custom cutoff and a hand-picked cutoff alone", () => {
    const custom = row("c", { charter: "ll", cutoff: "custom", customMonth: 7, customDay: 15 });
    assert.deepEqual(patchForCharterChange(custom, "dyb"), { charter: "dyb" });
    const picked = row("d", { charter: "ll", cutoff: "dyb" });
    assert.deepEqual(patchForCharterChange(picked, "dyb"), { charter: "dyb" });
    const both = row("e", { charter: "both", cutoff: "little-league" });
    assert.deepEqual(patchForCharterChange(both, "dyb"), { charter: "dyb" });
  });

  it("puts a removed row back at its old place", () => {
    const source = tableWith([
      row("a", { name: "7U" }),
      row("b", { name: "8U" }),
      row("c", { name: "9U" }),
    ]);
    const removed = removeBuilderRow(source, "b");
    const restored = insertBuilderRow(removed, source.rows[1]!, 1);
    assert.deepEqual(restored.rows.map((item) => item.id), ["a", "b", "c"]);
    assert.equal(insertBuilderRow(source, source.rows[1]!, 0).rows.length, 3);
  });
});

describe("forecast payload", () => {
  it("keeps each row's own window when the forecast uses one cutoff", () => {
    const draft = builderForecastProposed(
      tableWith([
        row("ll", { name: "7U Minors", minAge: 7, maxAge: 7, charter: "ll", cutoff: "little-league" }),
        row("dyb", { name: "9U", minAge: 9, maxAge: 9, charter: "dyb", cutoff: "dyb" }),
      ]),
    );
    assert.equal(draft.error, null);
    assert.ok(draft.proposed);
    const dybCutoff = effectiveCutoffDate(DYB_RULE, SEASON);
    const little = draft.proposed.divisions.find((division) => division.code === "7U Minors");
    assert.ok(little);
    const range = effectiveRange(little, dybCutoff);
    assert.equal(range.oldest, "2019-09-01");
    assert.equal(range.youngest, "2020-08-31");
    const diamond = draft.proposed.divisions.find((division) => division.code === "9U");
    assert.ok(diamond);
    assert.equal(effectiveRange(diamond, dybCutoff).oldest, "2017-05-01");
  });
});

describe("builder storage", () => {
  it("round-trips a table and rejects a file that is not one", () => {
    const source = tableWith([
      row("tee", {
        name: "Tee-ball",
        minAge: 4,
        maxAge: 5,
        charter: "teeball",
        cutoff: "custom",
        customMonth: 8,
        customDay: 31,
        oldestOverride: "2021-09-01",
      }),
      row("both", { name: "11U", minAge: 11, maxAge: 12, charter: "both", cutoff: "dyb" }),
    ]);
    const raw = serializeBuilderTable(source);
    const parsed = parseBuilderTable(raw);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.table, source);
    assert.equal(parseBuilderTable("{").ok, false);
    assert.equal(parseBuilderTable("[]").ok, false);
    const wrongVersion = parseBuilderTable(JSON.stringify({ ...source, version: 2 }));
    assert.equal(wrongVersion.ok, false);
    if (!wrongVersion.ok) assert.match(wrongVersion.error, /version/);
    const badCutoff = parseBuilderTable(
      JSON.stringify({ ...source, rows: [{ ...source.rows[0], cutoff: "school" }] }),
    );
    assert.equal(badCutoff.ok, false);
  });

  it("saves and loads by league and season, and start-over removes that key", () => {
    const store = memoryStore();
    const gonzales = tableWith([row("a", { name: "10U", minAge: 10, maxAge: 10 })], "gonzales", 2027);
    const ascension = tableWith(
      [row("b", { name: "Majors", minAge: 9, maxAge: 12, charter: "ll" })],
      "ascension",
      2027,
    );
    saveBuilderTable(store, gonzales);
    saveBuilderTable(store, ascension);
    assert.notEqual(builderStorageKey("gonzales", 2027), builderStorageKey("ascension", 2027));
    assert.notEqual(builderStorageKey("gonzales", 2027), builderStorageKey("gonzales", 2026));
    assert.deepEqual(loadBuilderTable(store, "gonzales", 2027), gonzales);
    assert.deepEqual(loadBuilderTable(store, "ascension", 2027), ascension);
    assert.equal(loadBuilderTable(store, "gonzales", 2026), null);
    clearBuilderTable(store, "gonzales", 2027);
    assert.equal(loadBuilderTable(store, "gonzales", 2027), null);
    assert.ok(loadBuilderTable(store, "ascension", 2027));
  });

  it("keeps a backup when the saved layout cannot be read", () => {
    const key = builderStorageKey("gonzales", 2027);
    const backup = builderBackupKey("gonzales", 2027);
    const store = memoryStore({ [key]: "not-json" });
    assert.equal(classifyBuilderRaw("not-json", "gonzales", 2027), "corrupt");
    assert.equal(loadBuilderTable(store, "gonzales", 2027), null);
    assert.equal(store.getItem(backup), "not-json");
    saveBuilderTable(store, blankBuilderTable("gonzales", 2027));
    assert.equal(store.getItem(backup), "not-json");
    assert.notEqual(store.getItem(key), "not-json");

    const later = memoryStore({ [key]: "second-bad", [backup]: "first-bad" });
    clearBuilderTable(later, "gonzales", 2027);
    assert.equal(later.getItem(key), null);
    assert.equal(later.getItem(backup), "first-bad");
  });
});

describe("division builder screen", () => {
  it("opens a blank builder on the step-by-step view", () => {
    const html = renderToStaticMarkup(
      createElement(DivisionAgesBuilder, {
        orgs: ["gonzales", "ascension"],
        defaultSeasonYear: 2027,
        seasonYears: [2026, 2027, 2028],
        persist: false,
      }),
    );
    assert.match(html, /Division Builder/);
    assert.match(html, /starts blank/);
    assert.match(html, /1\. Pick the season/);
    assert.match(html, /Start over/);
    assert.match(html, /Step by step/);
    assert.match(html, />Table</);
    assert.match(html, /Save to file/);
    assert.match(html, /Load from file/);
    assert.match(html, /Paste saved layout/);
    assert.doesNotMatch(html, /Export JSON/);
    assert.doesNotMatch(html, /Import JSON/);
    assert.match(html, /does not change saved Division Ages or registration/);
    assert.doesNotMatch(html, /Casey Example/);
  });

  it("shows a derived window, a same-league gap, and the read-only timeline", () => {
    const html = renderToStaticMarkup(
      createElement(DivisionAgesBuilder, {
        orgs: ["gonzales"],
        defaultSeasonYear: 2027,
        seasonYears: [2026, 2027],
        persist: false,
        initialTable: tableWith([
          row("ll", { name: "7U Minors", minAge: 7, maxAge: 7, charter: "ll", cutoff: "little-league" }),
          row("ten", { name: "10U", minAge: 10, maxAge: 10, charter: "ll", cutoff: "little-league" }),
        ]),
      }),
    );
    assert.match(html, /born Sep 1, 2019 – Aug 31, 2020/);
    assert.match(html, /Little League: Gap/);
    assert.match(html, /sticky left-0/);
    assert.match(html, /Advanced/);
    assert.match(html, /data-testid="builder-timeline"/);
    assert.match(html, /data-testid="birthdate-timeline"/);
    assert.doesNotMatch(html, /data-testid="age-editor"/);
    assert.doesNotMatch(html, /Move an edge/);
  });

  it("walks the review step in the wizard", () => {
    const html = renderToStaticMarkup(
      createElement(DivisionAgesBuilder, {
        orgs: ["ascension"],
        defaultSeasonYear: 2027,
        seasonYears: [2027],
        persist: false,
        initialMode: "wizard",
        initialStep: 4,
        initialTable: tableWith(
          [row("majors", { name: "Majors", minAge: 9, maxAge: 12, charter: "ll", cutoff: "little-league" })],
          "ascension",
          2027,
        ),
      }),
    );
    assert.match(html, /Review gaps, overlaps, and player counts/);
    assert.match(html, /born Sep 1, 2014 – Aug 31, 2018/);
    assert.match(html, /No gaps or overlaps/);
    assert.match(html, /Player and team counts/);
  });

  it("keeps an unfinished row on the review step", () => {
    const html = renderToStaticMarkup(
      createElement(DivisionAgesBuilder, {
        orgs: ["ascension"],
        defaultSeasonYear: 2027,
        seasonYears: [2027],
        persist: false,
        initialMode: "wizard",
        initialStep: 4,
        initialTable: tableWith([row("blank", { name: "", minAge: 8, maxAge: 8 })], "ascension", 2027),
      }),
    );
    assert.match(html, /Name this division/);
    assert.match(html, /data-testid="builder-incomplete"/);
    assert.doesNotMatch(html, /No gaps or overlaps/);
  });

  it("adds a Division Builder tab without hiding the forecast until it is opened", () => {
    const html = renderToStaticMarkup(
      createElement(DivisionAgesModeTabs, {
        builder: createElement("p", null, "BUILDER_PANEL"),
        divisions: createElement("p", null, "DIVISIONS_PANEL"),
        forecast: createElement("p", null, "FORECAST_PANEL"),
      }),
    );
    assert.match(html, /Division Builder/);
    assert.match(html, /BUILDER_PANEL/);
    assert.match(html, /id="division-ages-panel-divisions"[^>]*hidden/);
    assert.doesNotMatch(html, /id="division-ages-panel-builder"[^>]*hidden/);
    assert.doesNotMatch(html, /FORECAST_PANEL/);
  });
});
