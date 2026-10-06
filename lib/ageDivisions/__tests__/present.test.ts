import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DivisionAgesView } from "@/components/admin/DivisionAgesExplorer";

import {
  coverageWarningLines,
  divisionAgeRows,
  divisionTableTsv,
  lookupIsSplit,
  lookupLeague,
  seasonAgeHeadline,
} from "../present";

const YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

function row(org: "gonzales" | "ascension" | "fallball", seasonYear: number, code: string) {
  const found = divisionAgeRows(org, seasonYear).find((item) => item.code === code);
  assert.ok(found, code);
  return found;
}

function renderView(seasonYear: number, birthDate: string, orgs: Array<"gonzales" | "ascension" | "fallball">) {
  return renderToStaticMarkup(
    createElement(DivisionAgesView, {
      orgs,
      seasonYear,
      seasonYears: YEARS,
      onSeasonYearChange: () => {},
      birthDate,
      onBirthDateChange: () => {},
    }),
  );
}

describe("division ages page copy, season 2027", () => {
  it("shows the Gonzales 7U Minor and Ascension 7-8 Major ranges", () => {
    const minor = row("gonzales", 2027, "7U MINOR");
    assert.equal(minor.oldestLabel, "May 1, 2019");
    assert.equal(minor.youngestLabel, "Apr 30, 2020");

    const major = row("ascension", 2027, "7-8U MAJOR");
    assert.equal(major.oldestLabel, "Sep 1, 2018");
    assert.equal(major.youngestLabel, "Aug 31, 2020");
  });

  it("shows Fall 2026 ages as of Apr 30, 2027", () => {
    assert.equal(seasonAgeHeadline("fallball", 2026), "Fall 2026 → ages as of Apr 30, 2027");
  });

  it("warns on the Gonzales 6U overlap and the Fall Ball 15U/17U overlap", () => {
    const gonzales = coverageWarningLines("gonzales", 2027).join("\n");
    assert.match(gonzales, /Overlap: 6U Minor Coach Pitch, 6U Major Coach Pitch/);
    assert.doesNotMatch(gonzales, /Gap:/);

    const fallball = coverageWarningLines("fallball", 2026).join("\n");
    assert.match(fallball, /Overlap: 15U, 17U, May 1, 2011 – Apr 30, 2012/);
  });

  it("looks up 2019-07-17 as a split window", () => {
    const gonzales = lookupLeague("gonzales", "2019-07-17", 2027);
    assert.equal(gonzales.leagueAge, 7);
    assert.equal(gonzales.exactAgeLabel, "7 yrs, 9 mos");
    assert.deepEqual(gonzales.divisionLabels, ["7U Minor Coach Pitch"]);

    const ascension = lookupLeague("ascension", "2019-07-17", 2027);
    assert.equal(ascension.leagueAge, 8);
    assert.equal(ascension.exactAgeLabel, "8 yrs, 1 mo");
    assert.deepEqual(ascension.divisionLabels, ["Coach Pitch 8 Minor", "Coach Pitch 7-8 Major"]);

    assert.equal(lookupIsSplit(["gonzales", "ascension", "fallball"], "2019-07-17", 2027), true);
    assert.equal(lookupIsSplit(["gonzales"], "2019-07-17", 2027), false);
  });

  it("copies a TSV with min age, max age, and ISO birthdates", () => {
    const tsv = divisionTableTsv("gonzales", 2027);
    assert.equal(tsv.split("\n")[0], "division\tmin age\tmax age\toldest\tyoungest");
    assert.ok(tsv.includes("7U Minor Coach Pitch\t7\t7\t2019-05-01\t2020-04-30"));
  });
});

describe("division ages markup", () => {
  it("renders the season 2027 spot checks, the lookup, and the copy button", () => {
    const html = renderView(2027, "2019-07-17", ["gonzales", "ascension", "fallball"]);
    assert.match(html, /Built-in defaults\. Editing comes later\./);
    assert.match(html, /May 1, 2019/);
    assert.match(html, /Apr 30, 2020/);
    assert.match(html, /Sep 1, 2018/);
    assert.match(html, /Aug 31, 2020/);
    assert.match(html, /Spring 2027 → ages as of Apr 30, 2027/);
    assert.match(html, /6U Minor Coach Pitch, 6U Major Coach Pitch/);
    assert.match(html, /league age 7 \(7 yrs, 9 mos\)/);
    assert.match(html, /7U Minor Coach Pitch/);
    assert.match(html, /league age 8 \(8 yrs, 1 mo\)/);
    assert.match(html, /Coach Pitch 8 Minor/);
    assert.match(html, /Coach Pitch 7-8 Major/);
    assert.match(html, /data-testid="split-window"/);
    assert.match(html, /Copy table/);
    assert.match(html, /overflow-x-auto/);
    assert.doesNotMatch(html, /Settings/);
    assert.doesNotMatch(html, />Save</);
    assert.doesNotMatch(html, />Edit</);
  });

  it("renders the Fall 2026 cutoff", () => {
    const html = renderView(2026, "", ["fallball"]);
    assert.match(html, /Fall 2026 → ages as of Apr 30, 2027/);
    assert.match(html, /15U, 17U, May 1, 2011 – Apr 30, 2012/);
    assert.doesNotMatch(html, /data-testid="split-window"/);
  });

  it("copies with the TSV helper and does not fetch or read players", () => {
    const explorer = readFileSync(
      new URL("../../../components/admin/DivisionAgesExplorer.tsx", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../../../app/admin/season-setup/division-ages/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(explorer, /navigator\.clipboard\.writeText\(divisionTableTsv/);
    assert.doesNotMatch(explorer, /fetch\(|prisma|Enrollment|TeamPlayer/);
    assert.match(page, /canAccessAdminModule\(role, "DIVISION_AGES"/);
    assert.doesNotMatch(page, /prisma|Enrollment|TeamPlayer/);
  });
});
