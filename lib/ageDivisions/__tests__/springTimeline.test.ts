import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { DivisionAgesForecastView } from "@/components/admin/DivisionAgesForecast";
import { combinedForecastConfig } from "@/lib/admin/springCombined/view";
import { leagueDivisionDefaults } from "../defaults";
import type { ProposedConfig } from "../forecastView";
import { defaultIncludeFeeder } from "../forecastView";
import {
  changedDivisionCodes,
  forecastTimelineLayout,
  packSpringRows,
  shortTimelineLabel,
  springLabelFontSize,
  SPRING_AXIS_PAD_DAYS,
  visibleYearTicks,
  withLeadingYear,
} from "../springTimeline";

const SEASON = 2027;

function bandContents(html: string, code: string): string {
  const marker = `data-testid="timeline-band-${code}"`;
  const start = html.indexOf(marker);
  assert.ok(start >= 0, marker);
  const openEnd = html.indexOf(">", start);
  const close = html.indexOf("</button>", openEnd);
  assert.ok(openEnd > start && close > openEnd);
  return html.slice(openEnd + 1, close);
}

function forecastView(
  overrides: Partial<Parameters<typeof DivisionAgesForecastView>[0]> = {},
) {
  const proposed: ProposedConfig = {
    cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
    divisions: [{ code: "9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1 }],
  };
  return createElement(DivisionAgesForecastView, {
    org: "gonzales",
    orgs: ["gonzales"],
    seasonYears: [2026, SEASON],
    sourceSeason: 2026,
    targetSeason: SEASON,
    includeFeeder: defaultIncludeFeeder("gonzales"),
    retentionText: "",
    retentionDirty: false,
    retentionError: null,
    appliedRetention: 1,
    retentionHint: null,
    proposed,
    currentSourceLabel: "League defaults",
    forecast: null,
    loading: false,
    error: null,
    configError: null,
    onOrg: () => {},
    onSourceSeason: () => {},
    onTargetSeason: () => {},
    onIncludeFeeder: () => {},
    onRetentionText: () => {},
    onResetRetention: () => {},
    onCutoff: () => {},
    onDivisions: () => {},
    onLinkEdges: () => {},
    onResetProposed: () => {},
    baseline: null,
    linkEdges: true,
    editedCodes: [],
    editedSummary: "",
    ...overrides,
  });
}

const overlapping: ProposedConfig = {
  cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
  divisions: [
    { code: "7U", label: "7U Minors", minAge: 7, maxAge: 7, sortOrder: 1 },
    { code: "8U", label: "8U Minors", minAge: 8, maxAge: 8, sortOrder: 2 },
    { code: "7/8 MAJ", label: "7/8 Majors", minAge: 7, maxAge: 8, sortOrder: 3 },
  ],
};

describe("spring timeline layout gate", () => {
  it("keeps Fall on the classic strip and sends Spring leagues to lanes", () => {
    assert.equal(forecastTimelineLayout({ org: "fallball" }), "classic");
    assert.equal(forecastTimelineLayout({ org: "fallball", springCombined: false }), "classic");
    assert.equal(forecastTimelineLayout({ org: "gonzales" }), "spring-lanes");
    assert.equal(forecastTimelineLayout({ org: "ascension" }), "spring-lanes");
    assert.equal(forecastTimelineLayout({ org: "gonzales", springCombined: true }), "spring-lanes");
    assert.equal(SPRING_AXIS_PAD_DAYS < 180, true);

    const fall = renderToStaticMarkup(
      forecastView({ org: "fallball", orgs: ["fallball"], includeFeeder: false }),
    );
    assert.match(fall, /data-testid="timeline-layout-classic"/);
    assert.match(fall, /min-w-\[40rem\]/);
    assert.doesNotMatch(fall, /data-testid="timeline-layout-spring"/);
    assert.doesNotMatch(fall, /data-testid="timeline-lane-/);
    assert.match(bandContents(fall, "9U"), /9U/);

    const fallOverlap = renderToStaticMarkup(
      forecastView({
        org: "fallball",
        orgs: ["fallball"],
        includeFeeder: false,
        proposed: overlapping,
        linkEdges: true,
      }),
    );
    assert.match(fallOverlap, /data-testid="timeline-layout-classic"/);
    assert.match(fallOverlap, /repeating-linear-gradient/);
    assert.doesNotMatch(fallOverlap, /data-testid="timeline-layout-spring"/);

    const gonzales = renderToStaticMarkup(forecastView());
    assert.match(gonzales, /data-testid="timeline-layout-spring"/);
    assert.match(gonzales, /data-testid="timeline-lane-dyb"/);
    assert.doesNotMatch(gonzales, /data-testid="timeline-layout-classic"/);
    assert.doesNotMatch(gonzales, /repeating-linear-gradient/);
    assert.doesNotMatch(gonzales, /min-w-\[40rem\]/);
    assert.match(bandContents(gonzales, "9U"), />9U</);
    assert.doesNotMatch(bandContents(gonzales, "9U"), /players/);

    const ascension = renderToStaticMarkup(
      forecastView({ org: "ascension", orgs: ["ascension"], includeFeeder: false }),
    );
    assert.match(ascension, /data-testid="timeline-lane-llb"/);
    assert.doesNotMatch(ascension, /data-testid="timeline-lane-dyb"/);
    assert.doesNotMatch(ascension, /data-testid="timeline-layout-classic"/);
  });

  it("splits a combined Spring chart into an LLB lane and a DYB lane", () => {
    const gonzales = leagueDivisionDefaults("gonzales");
    const ascension = leagueDivisionDefaults("ascension");
    const proposed = combinedForecastConfig(
      [
        { organizationId: "gonzales", cutoff: gonzales.rule, divisions: gonzales.divisions },
        { organizationId: "ascension", cutoff: ascension.rule, divisions: ascension.divisions },
      ],
      SEASON,
    );
    const html = renderToStaticMarkup(
      forecastView({
        org: "gonzales",
        orgs: ["gonzales", "ascension"],
        springCombined: true,
        includeFeeder: false,
        proposed,
        baseline: proposed,
      }),
    );
    assert.match(html, /data-testid="timeline-layout-spring"/);
    assert.match(html, /data-testid="timeline-lane-llb"/);
    assert.match(html, /data-testid="timeline-lane-dyb"/);
    assert.doesNotMatch(html, /data-testid="timeline-layout-classic"/);
    assert.doesNotMatch(html, /repeating-linear-gradient/);
    assert.match(html, />T-Ball</);
    assert.match(html, />7\/8 Maj</);
    assert.match(html, />15\/17U</);
    assert.doesNotMatch(bandContents(html, "ascension:7-8U MAJOR"), /players/);
    assert.doesNotMatch(html, /data-testid="timeline-changed-/);
    const lock = html.slice(html.indexOf('data-testid="boundary-lock-'));
    const lockTag = lock.slice(0, lock.indexOf(">") + 1);
    assert.match(lockTag, /opacity-0/);
  });

  it("marks only divisions whose window changed and fits the axis to those dates", () => {
    const baseline: ProposedConfig = {
      cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
      divisions: [
        {
          code: "12U",
          label: "12U",
          minAge: 12,
          maxAge: 12,
          sortOrder: 1,
          oldestBirthdate: "2014-05-01",
          youngestBirthdate: "2015-04-30",
        },
        {
          code: "11U",
          label: "11U",
          minAge: 11,
          maxAge: 11,
          sortOrder: 2,
          oldestBirthdate: "2015-05-01",
          youngestBirthdate: "2016-04-30",
        },
      ],
    };
    const proposed: ProposedConfig = {
      ...baseline,
      divisions: [
        baseline.divisions[0]!,
        { ...baseline.divisions[1]!, youngestBirthdate: "2016-08-31" },
      ],
    };
    assert.deepEqual(changedDivisionCodes(proposed.divisions, baseline, "2027-04-30", "2027-04-30"), ["11U"]);
    const html = renderToStaticMarkup(
      forecastView({
        proposed,
        baseline,
        includeFeeder: false,
      }),
    );
    assert.match(html, /data-testid="timeline-changed-11U"/);
    assert.doesNotMatch(html, /data-testid="timeline-changed-12U"/);
    assert.match(html, />2014</);
    assert.match(html, />2016</);
    assert.doesNotMatch(html, />2009</);
    assert.doesNotMatch(bandContents(html, "11U"), /players/);
  });
});

describe("spring timeline labels and rows", () => {
  it("shortens division names and hides a label that cannot fit", () => {
    assert.equal(shortTimelineLabel("12U LLB", "ascension:12U"), "12U");
    assert.equal(shortTimelineLabel("Tee Ball 3-4", "3-4U TB"), "T-Ball");
    assert.equal(shortTimelineLabel("3-4U Tee Ball DYB", "3-4U TB"), "T-Ball");
    assert.equal(shortTimelineLabel("Tee Ball 5", "5U TB"), "5U TB");
    assert.equal(shortTimelineLabel("7/8 Majors LLB", "7-8U MAJOR"), "7/8 Maj");
    assert.equal(shortTimelineLabel("Coach Pitch 7-8 Major", "7-8U MAJOR"), "7/8 Maj");
    assert.equal(shortTimelineLabel("9-10 Major", "9-10U MAJOR"), "9/10 Maj");
    assert.equal(shortTimelineLabel("11-12 Major", "11-12U MAJOR"), "11/12 Maj");
    assert.equal(shortTimelineLabel("15/17U DYB", "15-17U"), "15/17U");
    assert.equal(shortTimelineLabel("6U Major Coach Pitch", "6U MAJOR"), "6U Maj");
    assert.equal(shortTimelineLabel("6U Minor Coach Pitch", "6U MINOR"), "6U");
    assert.equal(shortTimelineLabel("Modified Tee Ball/CP", "6U MOD"), "Mod");
    assert.equal(shortTimelineLabel("9U Kid Pitch", "9U KP"), "9U");
    const narrow = springLabelFontSize("7/8 Maj");
    assert.match(narrow, /100cqi/);
    assert.match(narrow, /clamp\(0px/);
  });

  it("stacks an overlapping majors bar and keeps a touching ladder on one row", () => {
    const rows = packSpringRows([
      { code: "11", oldest: "2014-09-01", youngest: "2015-08-31", sortOrder: 1 },
      { code: "10", oldest: "2015-09-01", youngest: "2016-08-31", sortOrder: 2 },
      { code: "8", oldest: "2018-09-01", youngest: "2019-08-31", sortOrder: 3 },
      { code: "7", oldest: "2019-09-01", youngest: "2020-08-31", sortOrder: 4 },
      { code: "maj", oldest: "2018-09-01", youngest: "2020-08-31", sortOrder: 5 },
    ]);
    assert.equal(rows.get("11"), 0);
    assert.equal(rows.get("10"), 0);
    assert.equal(rows.get("8"), 0);
    assert.equal(rows.get("7"), 0);
    assert.equal(rows.get("maj"), 1);
    assert.equal(Math.max(...rows.values()), 1);
  });

  it("drops year labels that would collide on a phone width", () => {
    const ticks = Array.from({ length: 12 }, (_, index) => ({
      left: (index / 11) * 100,
      label: String(2014 + index),
    }));
    const phone = visibleYearTicks(ticks, 360);
    const desktop = visibleYearTicks(ticks, 1100);
    assert.equal(phone[0]?.label, "2014");
    assert.equal(phone[phone.length - 1]?.label, "2025");
    assert.ok(phone.length < ticks.length);
    assert.ok(phone.length < desktop.length);
    const leading = withLeadingYear([{ left: 40, label: "2019" }], "2018-05-01");
    assert.equal(leading[0]?.label, "2018");
    assert.equal(leading[0]?.left, 0);
  });
});
