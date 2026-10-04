import assert from "node:assert/strict";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { DivisionAgesForecastView } from "@/components/admin/DivisionAgesForecast";
import { DivisionAgesModeTabs } from "@/components/admin/DivisionAgesExplorer";
import { setAllDivisionRosters, setDivisionRoster } from "../draft";
import type { ForecastSide } from "../forecast";
import {
  FORECAST_CAVEATS,
  FORECAST_DEBOUNCE_MS,
  buildForecastRequest,
  defaultIncludeFeeder,
  forecastQueryKey,
  shownRetentionPercent,
  withProposedCutoff,
  type ForecastResponse,
  type ProposedConfig,
} from "../forecastView";
import type { DivisionAgeConfig } from "../types";

function side(overrides: Partial<ForecastSide> = {}): ForecastSide {
  return { own: 10, feeder: 0, pool: 10, expected: 3, minTeams: 1, maxTeams: 1, ...overrides };
}

function response(overrides: Partial<ForecastResponse> = {}): ForecastResponse {
  const current = side({ own: 80, feeder: 12, pool: 92, expected: 92, minTeams: 8, maxTeams: 8 });
  const proposed = side({ own: 88, feeder: 12, pool: 100, expected: 100, minTeams: 11, maxTeams: 12 });
  return {
    organizationId: "gonzales",
    seasonYear: 2026,
    targetSeasonYear: 2027,
    includeFeeder: true,
    notes: ["No Fall Ball registration matches, so retention uses the fallback rate."],
    source: "enrollment",
    coveragePct: 100,
    sources: {
      own: { source: "enrollment", players: 92, datedPlayers: 92, coveragePct: 100 },
      feeder: { source: "enrollment", players: 12, datedPlayers: 12, coveragePct: 100 },
    },
    carryover: { springDistinct: 40, carried: 12, rate: 0.3, note: null },
    retention: { applied: 0.29, source: "fallback" },
    currentSource: "league",
    proposedSource: "request",
    rows: [
      {
        code: "9U",
        label: "9U",
        sortOrder: 1,
        inCurrent: true,
        inProposed: true,
        current,
        proposed,
        delta: side({ own: 8, feeder: 0, pool: 8, expected: 8, minTeams: 3, maxTeams: 4 }),
        movers: 4,
        currentShortRoster: false,
        proposedShortRoster: false,
        currentOverlap: 0,
        proposedOverlap: 2,
      },
      {
        code: "10U",
        label: "10U",
        sortOrder: 2,
        inCurrent: true,
        inProposed: true,
        current: side({ own: 5, feeder: 0, pool: 5, expected: 5, minTeams: 1, maxTeams: 1 }),
        proposed: side({ own: 5, feeder: 0, pool: 5, expected: 5, minTeams: 1, maxTeams: 1 }),
        delta: side({ own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
        movers: 0,
        currentShortRoster: true,
        proposedShortRoster: true,
        currentOverlap: 0,
        proposedOverlap: 0,
      },
    ],
    movers: 4,
    current: {
      distinctTotal: { own: 80, feeder: 12, total: 92 },
      tooYoung: { own: 1, feeder: 0, total: 1 },
      agedOut: { own: 2, feeder: 0, total: 2 },
      unmatched: { own: 0, feeder: 0, total: 0 },
    },
    proposed: {
      distinctTotal: { own: 88, feeder: 12, total: 100 },
      tooYoung: { own: 0, feeder: 0, total: 0 },
      agedOut: { own: 1, feeder: 0, total: 1 },
      unmatched: { own: 0, feeder: 0, total: 0 },
    },
    ...overrides,
  };
}

const proposedConfig: ProposedConfig = {
  cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
  divisions: [{ code: "9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1 }],
};

function inputTag(html: string, testId: string): string {
  const tags = html.match(/<input\b[^>]*>/g) ?? [];
  const tag = tags.find((item) => item.includes(`data-testid="${testId}"`));
  assert.ok(tag, html);
  return tag;
}

function view(overrides: Partial<ComponentProps<typeof DivisionAgesForecastView>> = {}) {
  return createElement(DivisionAgesForecastView, {
    org: "gonzales",
    orgs: ["gonzales"],
    seasonYears: [2026, 2027],
    sourceSeason: 2026,
    targetSeason: 2027,
    includeFeeder: defaultIncludeFeeder("gonzales"),
    retentionText: "",
    retentionDirty: false,
    retentionError: null,
    appliedRetention: 0.29,
    retentionHint: "Using the fallback rate.",
    proposed: proposedConfig,
    currentSourceLabel: "League defaults",
    forecast: response(),
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
    onDivision: () => {},
    onResetProposed: () => {},
    ...overrides,
  });
}

describe("forecast tab", () => {
  it("shows the feeder toggle on for Gonzales and hides it for other orgs", () => {
    assert.equal(defaultIncludeFeeder("gonzales"), true);
    assert.equal(defaultIncludeFeeder("ascension"), false);
    assert.equal(defaultIncludeFeeder("fallball"), false);

    const gonzales = renderToStaticMarkup(view());
    const toggle = inputTag(gonzales, "feeder-toggle");
    assert.match(toggle, /checked/);
    assert.match(gonzales, /Include Ascension feeder pool/);

    const ascension = renderToStaticMarkup(
      view({ org: "ascension", orgs: ["ascension"], includeFeeder: defaultIncludeFeeder("ascension") }),
    );
    assert.doesNotMatch(ascension, /feeder-toggle/);
    assert.doesNotMatch(ascension, /Include Ascension feeder pool/);

    const fallball = renderToStaticMarkup(
      view({ org: "fallball", orgs: ["fallball"], includeFeeder: false }),
    );
    assert.doesNotMatch(fallball, /feeder-toggle/);
  });

  it("defaults retention to the carryover percent and offers reset only after an edit", () => {
    assert.equal(
      shownRetentionPercent({ dirty: false, text: "10", applied: 0.29, org: "gonzales" }),
      "29",
    );
    assert.equal(
      shownRetentionPercent({ dirty: false, text: "", applied: null, org: "ascension" }),
      "44",
    );
    assert.equal(
      shownRetentionPercent({ dirty: true, text: "33", applied: 0.29, org: "gonzales" }),
      "33",
    );
    assert.equal(shownRetentionPercent({ dirty: false, text: "", applied: null, org: "fallball" }), "");

    const initial = renderToStaticMarkup(view());
    assert.match(inputTag(initial, "retention-percent"), /value="29"/);
    assert.doesNotMatch(initial, /data-testid="retention-reset"/);

    const edited = renderToStaticMarkup(view({ retentionDirty: true, retentionText: "33", appliedRetention: null }));
    assert.match(inputTag(edited, "retention-percent"), /value="33"/);
    assert.match(edited, /data-testid="retention-reset"/);
    assert.match(edited, />Reset</);

    const base = {
      sourceSeason: 2026,
      targetSeason: 2027,
      includeFeeder: true,
      proposed: proposedConfig,
    };
    const overridden = buildForecastRequest({ ...base, retentionOverride: 0.33 });
    const cleared = buildForecastRequest({ ...base, retentionOverride: null });
    assert.equal(overridden.retentionRate, 0.33);
    assert.equal("retentionRate" in cleared, false);
  });

  it("renders team ranges, the short-roster marker, and overlap as a warning", () => {
    const html = renderToStaticMarkup(view());
    assert.match(html, /8–8/);
    assert.match(html, /11–12/);
    assert.match(html, /Short roster/);
    assert.match(html, /Overlap/);
    assert.match(html, /Current config: League defaults/);
    assert.match(html, /\+8/);
    assert.match(html, /Players, counted once: current 92, proposed 100/);
    assert.match(html, /Too young: current 1, proposed 0/);
    assert.match(html, /Aged out: current 2, proposed 1/);
    assert.match(html, /Data source: Enrollment/);
    assert.match(html, /2026 Spring→Fall carryover: 12 of 40 \(30%\)/);
  });

  it("changes the forecast request when a proposed cutoff is edited", () => {
    assert.equal(FORECAST_DEBOUNCE_MS, 300);
    const before = buildForecastRequest({
      sourceSeason: 2026,
      targetSeason: 2027,
      includeFeeder: true,
      retentionOverride: null,
      proposed: proposedConfig,
    });
    const edited = withProposedCutoff(proposedConfig, { cutoffDay: 15 });
    const after = buildForecastRequest({
      sourceSeason: 2026,
      targetSeason: 2027,
      includeFeeder: true,
      retentionOverride: null,
      proposed: edited,
    });
    assert.equal(before.proposed?.cutoff.cutoffDay, 30);
    assert.equal(after.proposed?.cutoff.cutoffDay, 15);
    assert.notEqual(forecastQueryKey("gonzales", before), forecastQueryKey("gonzales", after));

    const html = renderToStaticMarkup(view({ proposed: edited }));
    assert.match(inputTag(html, "proposed-cutoff-day"), /value="15"/);
  });

  it("renders counts only, with the required caveats and no names or contact fields", () => {
    const payload = response();
    Object.assign(payload, {
      fullName: "Casey Example",
      birthDate: "2014-04-02",
      guardianEmail: "casey@example.com",
    });
    const html = renderToStaticMarkup(view({ forecast: payload }));
    for (const line of FORECAST_CAVEATS) assert.match(html, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, /Counts only/);
    assert.doesNotMatch(html, /Casey Example/);
    assert.doesNotMatch(html, /2014-04-02/);
    assert.doesNotMatch(html, /casey@example.com/);
    assert.doesNotMatch(html, /fullName/);
    assert.doesNotMatch(html, /guardianEmail/);
  });

  it("puts the forecast beside the division view", () => {
    const html = renderToStaticMarkup(
      createElement(DivisionAgesModeTabs, {
        divisions: createElement("p", null, "DIVISIONS_PANEL"),
        forecast: createElement("p", null, "FORECAST_PANEL"),
      }),
    );
    assert.match(html, /Forecast/);
    assert.match(html, /DIVISIONS_PANEL/);
    assert.doesNotMatch(html, /FORECAST_PANEL/);
  });

  it("applies one roster size to every division and clears a blank bound", () => {
    const divisions: DivisionAgeConfig[] = [
      { code: "9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1, rosterMin: 11, rosterMax: 12 },
      { code: "10U", label: "10U", minAge: 10, maxAge: 10, sortOrder: 2 },
    ];
    const all = setAllDivisionRosters(divisions, "10", "14");
    assert.equal(all[0]?.rosterMin, 10);
    assert.equal(all[1]?.rosterMax, 14);
    const cleared = setDivisionRoster(all[0]!, "rosterMin", "");
    assert.equal("rosterMin" in cleared, false);
    assert.equal(cleared.rosterMax, 14);
  });
});
