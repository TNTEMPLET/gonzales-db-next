import assert from "node:assert/strict";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { DivisionAgesForecastView } from "@/components/admin/DivisionAgesForecast";
import { effectiveCutoffDate, effectiveRange } from "@/lib/ageDivisions/compute";
import { buildCutoffImpact } from "@/lib/ageDivisions/cutoffImpact";
import { leagueDivisionDefaults } from "@/lib/ageDivisions/defaults";
import { buildTimelineModel, divisionBirthdateSpans, dragBoundaryUpdate, unionBirthdateAxis } from "@/lib/ageDivisions/forecastTimeline";
import { combinedForecastConfig } from "@/lib/admin/springCombined/view";
import {
  applyLinkedEdge,
  defaultIncludeFeeder,
  toggleTouchingBoundary,
  touchingBoundaryKey,
  type ProposedConfig,
} from "@/lib/ageDivisions/forecastView";
import type { DivisionAgeConfig } from "@/lib/ageDivisions/types";

const SEASON = 2027;

function gonzales(): ProposedConfig {
  const config = leagueDivisionDefaults("gonzales");
  return { cutoff: { ...config.rule }, divisions: config.divisions.map((division) => ({ ...division })) };
}

function byCode(divisions: readonly DivisionAgeConfig[]): Map<string, DivisionAgeConfig> {
  return new Map(divisions.map((division) => [division.code, division]));
}

function range(divisions: readonly DivisionAgeConfig[], code: string, cutoff: string) {
  const division = byCode(divisions).get(code);
  assert.ok(division);
  return effectiveRange(division, cutoff);
}

describe("touching boundary links", () => {
  const cutoff = "2027-04-30";

  it("moves the 7U and 8U line together so 7U starts May 1 and 8U ends April 30", () => {
    const divisions: DivisionAgeConfig[] = [
      { code: "8U MINOR", label: "8U Minors", minAge: 8, maxAge: 8, sortOrder: 1, oldestBirthdate: "2018-05-01", youngestBirthdate: "2019-04-30" },
      { code: "7U MINOR", label: "7U Minors", minAge: 7, maxAge: 7, sortOrder: 2, oldestBirthdate: "2019-05-01", youngestBirthdate: "2021-04-30" },
    ];
    const seven = divisions.findIndex((division) => division.code === "7U MINOR");
    const dragged = dragBoundaryUpdate(divisions, seven, "oldestBirthdate", "2020-05-01", cutoff, true);
    assert.equal(range(dragged, "7U MINOR", cutoff).oldest, "2020-05-01");
    assert.equal(range(dragged, "8U MINOR", cutoff).youngest, "2020-04-30");

    const typed = applyLinkedEdge(divisions, seven, "oldestBirthdate", "2020-05-01", cutoff, true);
    assert.equal(range(typed, "7U MINOR", cutoff).oldest, "2020-05-01");
    assert.equal(range(typed, "8U MINOR", cutoff).youngest, "2020-04-30");

    const config = gonzales();
    const liveSeven = config.divisions.findIndex((division) => division.code === "7U MINOR");
    const june = dragBoundaryUpdate(config.divisions, liveSeven, "oldestBirthdate", "2019-06-01", cutoff, true);
    assert.equal(range(june, "7U MINOR", cutoff).oldest, "2019-06-01");
    assert.equal(range(june, "8U MINOR", cutoff).youngest, "2019-05-31");
  });

  it("does not link an overlapping 7/8 Majors window", () => {
    const config = gonzales();
    const majors: DivisionAgeConfig = {
      code: "7-8U MAJOR",
      label: "7/8 Majors",
      minAge: 7,
      maxAge: 8,
      sortOrder: 6.5,
    };
    const divisions = [...config.divisions, majors];
    const seven = divisions.findIndex((division) => division.code === "7U MINOR");
    const next = applyLinkedEdge(divisions, seven, "oldestBirthdate", "2019-06-01", cutoff, true);
    const codes = byCode(next);
    assert.equal(codes.get("8U MINOR")?.youngestBirthdate, "2019-05-31");
    assert.equal(codes.get("7-8U MAJOR")?.oldestBirthdate, undefined);
    assert.equal(codes.get("7-8U MAJOR")?.youngestBirthdate, undefined);
    const majorRange = effectiveRange(codes.get("7-8U MAJOR")!, cutoff);
    assert.equal(majorRange.oldest, "2018-05-01");
    assert.equal(majorRange.youngest, "2020-04-30");
  });

  it("keeps an identical 6U window together and lets an unlinked boundary open a gap", () => {
    const config = gonzales();
    const minor = config.divisions.findIndex((division) => division.code === "6U MINOR");
    const key = touchingBoundaryKey("6U MINOR", "5U TB");
    const opened = toggleTouchingBoundary(new Set(), ["6U MINOR", "6U MAJOR"], ["5U TB"]);
    assert.equal(opened.has(key), true);
    assert.equal(opened.has(touchingBoundaryKey("6U MAJOR", "5U TB")), true);

    const linked = applyLinkedEdge(config.divisions, minor, "youngestBirthdate", "2021-01-31", cutoff, true);
    assert.equal(byCode(linked).get("6U MAJOR")?.youngestBirthdate, "2021-01-31");
    assert.equal(byCode(linked).get("5U TB")?.oldestBirthdate, "2021-02-01");

    const unlinked = applyLinkedEdge(config.divisions, minor, "youngestBirthdate", "2021-01-31", cutoff, true, {
      unlinked: opened,
    });
    assert.equal(byCode(unlinked).get("6U MINOR")?.youngestBirthdate, "2021-01-31");
    assert.equal(byCode(unlinked).get("6U MAJOR")?.youngestBirthdate, "2021-01-31");
    assert.equal(byCode(unlinked).get("5U TB")?.oldestBirthdate, undefined);

    const alt = applyLinkedEdge(config.divisions, minor, "youngestBirthdate", "2021-01-31", cutoff, true, {
      unlinkTouching: true,
    });
    assert.equal(byCode(alt).get("6U MAJOR")?.youngestBirthdate, "2021-01-31");
    assert.equal(byCode(alt).get("5U TB")?.oldestBirthdate, undefined);

    const rejoined = toggleTouchingBoundary(opened, ["6U MINOR", "6U MAJOR"], ["5U TB"]);
    assert.equal(rejoined.size, 0);
  });

  it("shows both divisions on the impact card when the joined line moves", () => {
    const config = gonzales();
    const cutoffIso = effectiveCutoffDate(config.cutoff, SEASON);
    const seven = config.divisions.findIndex((division) => division.code === "7U MINOR");
    const proposed: ProposedConfig = {
      cutoff: config.cutoff,
      divisions: applyLinkedEdge(config.divisions, seven, "oldestBirthdate", "2019-06-01", cutoffIso, true),
    };
    const impact = buildCutoffImpact({
      buckets: [
        { birthDate: "2019-05-15", count: 4, pool: "own" },
        { birthDate: "2019-08-01", count: 3, pool: "own" },
      ],
      baseline: config,
      proposed,
      targetSeasonYear: SEASON,
      options: { includeFeeder: false },
    });
    const codes = impact.divisions.map((division) => division.code);
    assert.ok(codes.includes("7U MINOR"));
    assert.ok(codes.includes("8U MINOR"));
    assert.match(impact.summary, /7U/);
    assert.match(impact.summary, /8U/);
  });
});

describe("combined spring forecast editor", () => {
  it("keeps a lock on Gonzales 7U and 8U when Ascension windows sit between them", () => {
    const gonzalesDefaults = leagueDivisionDefaults("gonzales");
    const ascension = leagueDivisionDefaults("ascension");
    const config = combinedForecastConfig(
      [
        { organizationId: "gonzales", cutoff: gonzalesDefaults.rule, divisions: gonzalesDefaults.divisions },
        { organizationId: "ascension", cutoff: ascension.rule, divisions: ascension.divisions },
      ],
      SEASON,
    );
    const cutoff = "2027-04-30";
    const axis = unionBirthdateAxis(divisionBirthdateSpans(config.divisions, cutoff), 0);
    const model = buildTimelineModel(config.divisions, cutoff, axis);
    assert.ok(model);
    const boundary = model.edges.find(
      (edge) =>
        edge.olderCodes.includes("gonzales:8U MINOR") && edge.youngerCodes.includes("gonzales:7U MINOR"),
    );
    assert.ok(boundary);
    assert.equal(boundary.field, "oldestBirthdate");
    assert.equal(boundary.date, "2019-05-01");
  });

  it("shows the what-if note and a lock on the joined 7U and 8U line", () => {
    const config = gonzales();
    const html = renderToStaticMarkup(
      createElement(DivisionAgesForecastView, {
        org: "gonzales",
        orgs: ["gonzales", "ascension"],
        seasonYears: [2026, 2027],
        sourceSeason: 2026,
        targetSeason: 2027,
        includeFeeder: defaultIncludeFeeder("gonzales"),
        retentionText: "",
        retentionDirty: false,
        retentionError: null,
        appliedRetention: 1,
        retentionHint: null,
        proposed: config,
        baseline: config,
        currentSourceLabel: "Both leagues",
        forecast: null,
        loading: false,
        error: null,
        configError: null,
        linkEdges: true,
        editedCodes: [],
        editedSummary: "",
        springCombined: true,
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
      } satisfies ComponentProps<typeof DivisionAgesForecastView>),
    );
    assert.match(html, /Apply LL Aug 31 to LLB divisions/);
    assert.match(html, /Apply DYB Apr 30 to DYB divisions/);
    assert.match(html, /data-testid="retention-percent"/);
    assert.match(html, /data-testid="spring-what-if"/);
    assert.match(html, /Combined changes are a what-if/);
    assert.doesNotMatch(html, /data-testid="proposed-cutoff-day"/);
    assert.doesNotMatch(html, /Cutoff month/);
    assert.doesNotMatch(html, /Year offset/);
    assert.doesNotMatch(html, /data-testid="cutoff-preset-custom"/);
    assert.doesNotMatch(html, /Proposed cutoff month/);
    assert.doesNotMatch(html, /Proposed cutoff day/);
    assert.doesNotMatch(html, /Proposed year offset/);
    assert.match(html, /boundary-lock-between:/);
    assert.match(html, /Joined boundary/);
    assert.doesNotMatch(html, /data-testid="feeder-toggle"/);
    assert.doesNotMatch(html, /<span class="mb-1 block text-\[10px\] font-bold uppercase tracking-\[0\.2em\] text-zinc-500">Organization<\/span>/);
  });
});
