import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { combinedForecastConfig } from "@/lib/admin/springCombined/view";
import { coveredSpans, coverageWarnings, uncoveredSpans } from "../compute";
import {
  builderCoverageIssues,
  newBuilderRow,
  type BuilderRow,
  type BuilderTable,
} from "../divisionBuilder";
import type { DivisionAgeConfig } from "../types";

const SEASON = 2027;

function row(id: string, patch: Partial<Omit<BuilderRow, "id">>): BuilderRow {
  return newBuilderRow(id, patch);
}

function tableWith(rows: BuilderRow[], organizationId = "gonzales", seasonYear = SEASON): BuilderTable {
  return { version: 1, organizationId, seasonYear, rows };
}

function division(
  code: string,
  label: string,
  minAge: number,
  maxAge: number,
  oldest: string,
  youngest: string,
  sortOrder: number,
): DivisionAgeConfig {
  return {
    code,
    label,
    minAge,
    maxAge,
    sortOrder,
    oldestBirthdate: oldest,
    youngestBirthdate: youngest,
  };
}

describe("uncoveredSpans", () => {
  it("returns the whole span when nothing covers it", () => {
    assert.deepEqual(uncoveredSpans("2020-09-01", "2021-04-30", []), [
      { from: "2020-09-01", to: "2021-04-30" },
    ]);
  });

  it("returns nothing when one range covers the span, including days outside it", () => {
    assert.deepEqual(
      uncoveredSpans("2020-09-01", "2021-04-30", [{ oldest: "2020-05-01", youngest: "2021-04-30" }]),
      [],
    );
    assert.deepEqual(
      uncoveredSpans("2020-09-01", "2021-04-30", [{ oldest: "2020-09-01", youngest: "2021-04-30" }]),
      [],
    );
  });

  it("treats the first and last day as covered, and the day just outside as open", () => {
    assert.deepEqual(uncoveredSpans("2020-09-01", "2020-09-03", [{ oldest: "2020-09-01", youngest: "2020-09-01" }]), [
      { from: "2020-09-02", to: "2020-09-03" },
    ]);
    assert.deepEqual(uncoveredSpans("2020-09-01", "2020-09-03", [{ oldest: "2020-09-03", youngest: "2020-09-03" }]), [
      { from: "2020-09-01", to: "2020-09-02" },
    ]);
    assert.deepEqual(uncoveredSpans("2020-09-01", "2020-09-01", [{ oldest: "2020-09-02", youngest: "2020-09-02" }]), [
      { from: "2020-09-01", to: "2020-09-01" },
    ]);
    assert.deepEqual(uncoveredSpans("2020-09-01", "2020-09-01", [{ oldest: "2020-09-01", youngest: "2020-09-01" }]), []);
  });

  it("leaves no hole when ranges touch on the next day", () => {
    assert.deepEqual(
      uncoveredSpans("2020-09-01", "2021-04-30", [
        { oldest: "2020-09-01", youngest: "2020-12-31" },
        { oldest: "2021-01-01", youngest: "2021-04-30" },
      ]),
      [],
    );
    assert.deepEqual(
      coveredSpans("2020-09-01", "2021-04-30", [
        { oldest: "2020-09-01", youngest: "2020-12-31" },
        { oldest: "2021-01-01", youngest: "2021-04-30" },
      ]),
      [{ from: "2020-09-01", to: "2021-04-30" }],
    );
  });

  it("keeps a one-day hole between ranges and a remainder on each side", () => {
    assert.deepEqual(
      uncoveredSpans("2020-09-01", "2020-09-05", [
        { oldest: "2020-09-02", youngest: "2020-09-02" },
        { oldest: "2020-09-04", youngest: "2020-09-04" },
      ]),
      [
        { from: "2020-09-01", to: "2020-09-01" },
        { from: "2020-09-03", to: "2020-09-03" },
        { from: "2020-09-05", to: "2020-09-05" },
      ],
    );
  });

  it("ignores a backwards span and a range that does not parse", () => {
    assert.deepEqual(uncoveredSpans("2021-04-30", "2020-09-01", [{ oldest: "2020-05-01", youngest: "2021-04-30" }]), []);
    assert.deepEqual(uncoveredSpans("2020-09-01", "not-a-date", []), []);
    assert.deepEqual(
      uncoveredSpans("2020-09-01", "2020-09-03", [{ oldest: "bad", youngest: "2020-09-02" }]),
      [{ from: "2020-09-01", to: "2020-09-03" }],
    );
  });
});

describe("cross-league builder coverage", () => {
  it("turns a Little League gap that 6U DYB covers into one note", () => {
    const issues = builderCoverageIssues(
      tableWith([
        row("majors", { name: "7/8 Majors LLB", minAge: 7, maxAge: 8, charter: "ll", cutoff: "little-league" }),
        row("tee", { name: "Tee-ball LLB", minAge: 4, maxAge: 5, charter: "ll", cutoff: "dyb" }),
        row("six", { name: "6U DYB", minAge: 6, maxAge: 6, charter: "dyb", cutoff: "dyb" }),
      ]),
    );
    assert.deepEqual(
      issues.filter((issue) => issue.kind === "gap"),
      [],
    );
    const covered = issues.filter((issue) => issue.kind === "covered");
    assert.equal(covered.length, 1);
    assert.equal(
      covered[0]?.message,
      "Little League: kids born Sep 1, 2020 – Apr 30, 2021 are covered by 6U DYB (May 1, 2020 – Apr 30, 2021).",
    );
    assert.deepEqual(covered[0]?.rowIds, ["six"]);
  });

  it("turns a Diamond gap that Little League covers into a note", () => {
    const issues = builderCoverageIssues(
      tableWith([
        row("dyb10", { name: "10U DYB", minAge: 10, maxAge: 10, charter: "dyb", cutoff: "dyb" }),
        row("dyb8", { name: "8U DYB", minAge: 8, maxAge: 8, charter: "dyb", cutoff: "dyb" }),
        row("ll", { name: "9-10U LL", minAge: 9, maxAge: 10, charter: "ll", cutoff: "little-league" }),
      ]),
    );
    assert.deepEqual(
      issues.filter((issue) => issue.kind === "gap"),
      [],
    );
    const covered = issues.filter((issue) => issue.kind === "covered");
    assert.equal(covered.length, 1);
    assert.match(covered[0]?.message ?? "", /^Diamond \/ Dixie: kids born May 1, 2017 – Apr 30, 2018 are covered by 9-10U LL /);
    assert.deepEqual(covered[0]?.rowIds, ["ll"]);
  });

  it("keeps a gap neither league covers", () => {
    const issues = builderCoverageIssues(
      tableWith([
        row("eight", { name: "8U Minors", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
        row("ten", { name: "10U", minAge: 10, maxAge: 10, charter: "ll", cutoff: "little-league" }),
        row("dyb", { name: "14U DYB", minAge: 14, maxAge: 14, charter: "dyb", cutoff: "dyb" }),
      ]),
    );
    const gaps = issues.filter((issue) => issue.kind === "gap");
    assert.equal(gaps.length, 1);
    assert.match(gaps[0]?.message ?? "", /Little League: Gap: kids born Sep 1, 2017 – Aug 31, 2018/);
    assert.deepEqual(
      issues.filter((issue) => issue.kind === "covered"),
      [],
    );
  });

  it("splits a partly covered gap into the open remainder and a note", () => {
    const issues = builderCoverageIssues(
      tableWith([
        row("eight", { name: "8U Minors", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
        row("ten", { name: "10U", minAge: 10, maxAge: 10, charter: "ll", cutoff: "little-league" }),
        row("dyb", { name: "9U", minAge: 9, maxAge: 9, charter: "dyb", cutoff: "dyb" }),
      ]),
    );
    const gaps = issues.filter((issue) => issue.kind === "gap");
    const covered = issues.filter((issue) => issue.kind === "covered");
    assert.equal(gaps.length, 1);
    assert.match(gaps[0]?.message ?? "", /Little League: Gap: kids born May 1, 2018 – Aug 31, 2018/);
    assert.deepEqual(gaps[0]?.rowIds.sort(), ["eight", "ten"]);
    assert.equal(covered.length, 1);
    assert.match(covered[0]?.message ?? "", /Little League: kids born Sep 1, 2017 – Apr 30, 2018 are covered by 9U \(May 1, 2017 – Apr 30, 2018\)/);
    assert.deepEqual(covered[0]?.rowIds, ["dyb"]);
  });

  it("lets a Tee-ball row cover a Diamond gap", () => {
    const issues = builderCoverageIssues(
      tableWith([
        row("dyb10", { name: "10U DYB", minAge: 10, maxAge: 10, charter: "dyb", cutoff: "dyb" }),
        row("dyb8", { name: "8U DYB", minAge: 8, maxAge: 8, charter: "dyb", cutoff: "dyb" }),
        row("tee", { name: "Tee-ball", minAge: 9, maxAge: 10, charter: "teeball", cutoff: "little-league" }),
      ]),
    );
    assert.deepEqual(
      issues.filter((issue) => issue.kind === "gap"),
      [],
    );
    const covered = issues.filter((issue) => issue.kind === "covered");
    assert.equal(covered.length, 1);
    assert.match(covered[0]?.message ?? "", /Diamond \/ Dixie: kids born May 1, 2017 – Apr 30, 2018 are covered by Tee-ball /);
  });

  it("leaves Fall Ball gaps unchanged", () => {
    const rows = [
      row("eight", { name: "8U Minors", minAge: 8, maxAge: 8, charter: "ll", cutoff: "little-league" }),
      row("ten", { name: "10U", minAge: 10, maxAge: 10, charter: "ll", cutoff: "little-league" }),
      row("dyb", { name: "9U", minAge: 9, maxAge: 9, charter: "dyb", cutoff: "dyb" }),
    ];
    const issues = builderCoverageIssues(tableWith(rows, "fallball"));
    const gaps = issues.filter((issue) => issue.kind === "gap");
    assert.equal(gaps.length, 1);
    assert.match(gaps[0]?.message ?? "", /Sep 1, 2017 – Aug 31, 2018/);
    assert.deepEqual(
      issues.filter((issue) => issue.kind === "covered"),
      [],
    );
  });
});

describe("combined Spring forecast union", () => {
  it("raises no gap when 6U DYB covers a Little League hole", () => {
    const little: DivisionAgeConfig[] = [
      division("majors", "7/8 Majors LLB", 7, 8, "2018-09-01", "2020-08-31", 1),
      division("tee", "Tee-ball LLB", 4, 5, "2021-05-01", "2023-04-30", 2),
    ];
    const six = division("6U", "6U DYB", 6, 6, "2020-05-01", "2021-04-30", 1);
    const littleOnly = coverageWarnings(little, "2027-08-31").filter((warning) => warning.kind === "gap");
    assert.equal(littleOnly.length, 1);
    assert.equal(littleOnly[0]?.from, "2020-09-01");
    assert.equal(littleOnly[0]?.to, "2021-04-30");

    const combined = combinedForecastConfig(
      [
        { organizationId: "ascension", cutoff: { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 }, divisions: little },
        { organizationId: "gonzales", cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 }, divisions: [six] },
      ],
      SEASON,
    );
    assert.deepEqual(
      coverageWarnings(combined.divisions, "2027-04-30").filter((warning) => warning.kind === "gap"),
      [],
    );
  });
});
