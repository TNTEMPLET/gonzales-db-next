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
  builderCoverageIssues,
  builderForecastProposed,
  builderRowWindow,
  builderStorageKey,
  clearBuilderTable,
  loadBuilderTable,
  moveBuilderRow,
  newBuilderRow,
  parseBuilderTable,
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

  it("flags the birthdays between an LL 8U row and a DYB 9U row", () => {
    const issues = builderCoverageIssues(
      tableWith([
        row("eight", { name: "8U Minors", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
        row("nine", { name: "9U", minAge: 9, maxAge: 9, charter: "dyb", cutoff: "dyb" }),
      ]),
    );
    const gap = issues.find((issue) => issue.kind === "gap");
    assert.ok(gap);
    assert.match(gap.message, /Gap/);
    assert.match(gap.message, /May 1, 2018/);
    assert.match(gap.message, /Aug 31, 2018/);
    assert.deepEqual(gap.rowIds.sort(), ["eight", "nine"]);
  });

  it("flags birthdays that land in two divisions with different cutoffs", () => {
    const issues = builderCoverageIssues(
      tableWith([
        row("ll", { name: "8U LL", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
        row("dyb", { name: "8U DYB", minAge: 8, maxAge: 8, charter: "dyb", cutoff: "dyb" }),
      ]),
    );
    const overlap = issues.find((issue) => issue.kind === "overlap");
    assert.ok(overlap);
    assert.match(overlap.message, /Overlap/);
    assert.match(overlap.message, /8U LL/);
    assert.match(overlap.message, /8U DYB/);
    assert.match(overlap.message, /Sep 1, 2018/);
    assert.match(overlap.message, /Apr 30, 2019/);
  });

  it("names a division that still needs a name", () => {
    const issues = builderCoverageIssues(tableWith([row("blank", { name: "", minAge: 6, maxAge: 6 })]));
    assert.equal(issues[0]?.kind, "incomplete");
    assert.match(issues[0]?.message ?? "", /Name this division/);
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

  it("ignores a stored value that does not parse", () => {
    const key = builderStorageKey("gonzales", 2027);
    const store = memoryStore({ [key]: "not-json" });
    assert.equal(loadBuilderTable(store, "gonzales", 2027), null);
  });
});

describe("division builder screen", () => {
  it("opens on a blank table with the wizard available", () => {
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
    assert.match(html, /Add a division/);
    assert.match(html, /Start over/);
    assert.match(html, /Step by step/);
    assert.match(html, /does not change saved Division Ages or registration/);
    assert.doesNotMatch(html, /Casey Example/);
  });

  it("shows a derived window, a gap, and the read-only timeline", () => {
    const html = renderToStaticMarkup(
      createElement(DivisionAgesBuilder, {
        orgs: ["gonzales"],
        defaultSeasonYear: 2027,
        seasonYears: [2026, 2027],
        persist: false,
        initialTable: tableWith([
          row("ll", { name: "7U Minors", minAge: 7, maxAge: 7, charter: "ll", cutoff: "little-league" }),
          row("dyb", { name: "9U", minAge: 9, maxAge: 9, charter: "dyb", cutoff: "dyb" }),
        ]),
      }),
    );
    assert.match(html, /born Sep 1, 2019 – Aug 31, 2020/);
    assert.match(html, /Gap/);
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
