import assert from "node:assert/strict";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { DivisionAgesForecastView } from "@/components/admin/DivisionAgesForecast";
import { DivisionAgesModeTabs } from "@/components/admin/DivisionAgesExplorer";
import { effectiveCutoffDate, effectiveRange } from "../compute";
import { validateSeasonWrite } from "../schema";
import { setAllDivisionRosters, setDivisionRoster } from "../draft";
import { compareConfigs, DEFAULT_ROSTER, type BirthBucket, type ForecastSide, type PoolSplit } from "../forecast";
import {
  FORECAST_CAVEATS,
  FORECAST_DEBOUNCE_MS,
  applyLinkedEdge,
  betweenDivisionCount,
  buildForecastRequest,
  combineDivisions,
  eligibilityShown,
  splitDivisionAt,
  storedDraftAction,
  structuralScenario,
  carryoverReferenceLabel,
  defaultIncludeFeeder,
  editedDivisionCodes,
  forecastDraftKey,
  forecastEditedSummary,
  forecastQueryKey,
  gapWarningText,
  newOverlapMessages,
  sameProposedConfig,
  shownRetentionPercent,
  whereKidsMoveLines,
  withProposedCutoff,
  type ForecastResponse,
  type ProposedConfig,
} from "../forecastView";
import type { DivisionAgeConfig } from "../types";

function side(overrides: Partial<ForecastSide> = {}): ForecastSide {
  return { own: 10, feeder: 0, pool: 10, expected: 3, minTeams: 1, maxTeams: 1, ...overrides };
}

function split(own = 0, feeder = 0): PoolSplit {
  return { own, feeder, total: own + feeder };
}

function response(overrides: Partial<ForecastResponse> = {}): ForecastResponse {
  const current = side({ own: 80, feeder: 12, pool: 92, expected: 92, minTeams: 8, maxTeams: 8 });
  const proposed = side({ own: 88, feeder: 12, pool: 100, expected: 100, minTeams: 11, maxTeams: 12 });
  return {
    organizationId: "gonzales",
    seasonYear: 2026,
    targetSeasonYear: 2027,
    includeFeeder: true,
    feederShare: 0.1,
    notes: ["Spring→Fall carryover is reference only and is not used in the forecast."],
    source: "enrollment",
    coveragePct: 100,
    sources: {
      own: { source: "enrollment", players: 92, datedPlayers: 92, coveragePct: 100 },
      feeder: { source: "enrollment", players: 12, datedPlayers: 12, coveragePct: 100 },
    },
    carryover: { springDistinct: 40, carried: 12, rate: 0.3, note: null },
    retention: { applied: 1, source: "default" },
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
        moversIn: split(3, 1),
        moversOut: split(1, 0),
        currentShortRoster: false,
        proposedShortRoster: false,
        currentOverlap: 0,
        proposedOverlap: 2,
        currentSharedPoolId: null,
        proposedSharedPoolId: null,
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
        moversIn: split(),
        moversOut: split(),
        currentShortRoster: true,
        proposedShortRoster: true,
        currentOverlap: 0,
        proposedOverlap: 0,
        currentSharedPoolId: null,
        proposedSharedPoolId: null,
      },
    ],
    sharedPools: [],
    league: {
      current,
      proposed,
      delta: side({ own: 8, feeder: 0, pool: 8, expected: 8, minTeams: 3, maxTeams: 4 }),
    },
    movers: 4,
    flows: [{ from: "10U", to: "9U", own: 3, feeder: 1, total: 4 }],
    currentWarnings: [],
    proposedWarnings: [],
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
    eligibility: [],
    ...overrides,
  };
}

const proposedConfig: ProposedConfig = {
  cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
  divisions: [{ code: "9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1 }],
};

function gapWarningTag(html: string): string {
  const tag = html.match(/<p\b[^>]*data-testid="gap-warning"[^>]*>/)?.[0];
  assert.ok(tag, html);
  return tag;
}

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
    appliedRetention: 1,
    retentionHint: "Using the default return rate of 100%.",
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
    assert.doesNotMatch(fallball, /data-testid="age-editor-toggle"/);
    assert.doesNotMatch(fallball, /id="division-ages-age-editor"/);
    assert.match(fallball, /<h3 class="text-sm font-semibold text-white">Edit by age<\/h3>/);
    assert.match(fallball, /data-testid="age-editor"/);
    assert.match(fallball, /The birthdate window follows these ages\./);
  });

  it("defaults the return rate to 100% and offers reset only after an edit", () => {
    assert.equal(
      shownRetentionPercent({ dirty: false, text: "10", applied: 1, org: "gonzales" }),
      "100",
    );
    assert.equal(
      shownRetentionPercent({ dirty: false, text: "", applied: null, org: "ascension" }),
      "100",
    );
    assert.equal(
      shownRetentionPercent({ dirty: true, text: "33", applied: 1, org: "gonzales" }),
      "33",
    );
    assert.equal(shownRetentionPercent({ dirty: false, text: "", applied: null, org: "fallball" }), "100");
    assert.equal(
      carryoverReferenceLabel("gonzales", 2026, { rate: null }),
      "Spring→Fall 2026 carryover: 29%, reference only",
    );
    assert.equal(
      carryoverReferenceLabel("gonzales", 2026, { rate: 0.3 }),
      "Spring→Fall 2026 carryover: 30%, reference only",
    );

    const initial = renderToStaticMarkup(view());
    assert.match(inputTag(initial, "retention-percent"), /value="100"/);
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
    assert.match(html, /Spring→Fall 2026 carryover: 30%, reference only/);
    assert.match(html, /League total, each player once/);
    assert.match(html, /Feeder share 10%/);
  });

  it("marks overlapping divisions as a shared pool", () => {
    const forecast = response({
      sharedPools: [
        {
          poolKey: "6U-major+6U-minor",
          codes: ["6U-minor", "6U-major"],
          label: "Shared pool: 6U Minor, 6U Major",
          current: side({ own: 20, feeder: 0, pool: 20, expected: 20, minTeams: 2, maxTeams: 2 }),
          proposed: side({ own: 20, feeder: 0, pool: 20, expected: 20, minTeams: 2, maxTeams: 2 }),
          currentShortRoster: false,
          proposedShortRoster: false,
        },
      ],
      league: {
        current: side({ own: 20, feeder: 0, pool: 20, expected: 20, minTeams: 2, maxTeams: 2 }),
        proposed: side({ own: 20, feeder: 0, pool: 20, expected: 20, minTeams: 2, maxTeams: 2 }),
        delta: side({ own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
      },
      rows: [
        {
          code: "6U-minor",
          label: "6U Minor",
          sortOrder: 1,
          inCurrent: true,
          inProposed: true,
          current: side({ own: 20, feeder: 0, pool: 20, expected: 20, minTeams: 2, maxTeams: 2 }),
          proposed: side({ own: 20, feeder: 0, pool: 20, expected: 20, minTeams: 2, maxTeams: 2 }),
          delta: side({ own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
          movers: 0,
          moversIn: split(),
          moversOut: split(),
          currentShortRoster: false,
          proposedShortRoster: false,
          currentOverlap: 20,
          proposedOverlap: 20,
          currentSharedPoolId: "6U-major+6U-minor",
          proposedSharedPoolId: "6U-major+6U-minor",
        },
      ],
    });
    const html = renderToStaticMarkup(view({ forecast }));
    assert.match(html, /data-testid="shared-pool"/);
    assert.match(html, /Shared pool: 6U Minor, 6U Major/);
    assert.match(html, /Counted once/);
    assert.match(html, /data-testid="shared-pool-member"/);
    assert.match(html, /League total, each player once: current 20 expected, teams 2–2/);
  });

  it("hides the shared-pool row in combined Spring and keeps it for one league and Fall", () => {
    const forecast = response({
      sharedPools: [
        {
          poolKey: "chain",
          codes: ["gonzales:TB", "ascension:TB"],
          label: "Shared pool: 3-4U Tee Ball DYB, Tee Ball LLB",
          current: side({ own: 1116, feeder: 0, pool: 1116, expected: 1116, minTeams: 93, maxTeams: 101 }),
          proposed: side({ own: 1116, feeder: 0, pool: 1116, expected: 1116, minTeams: 93, maxTeams: 101 }),
          currentShortRoster: false,
          proposedShortRoster: false,
        },
      ],
      league: {
        current: side({ own: 1116, feeder: 0, pool: 1116, expected: 1116, minTeams: 93, maxTeams: 101 }),
        proposed: side({ own: 1116, feeder: 0, pool: 1116, expected: 1116, minTeams: 93, maxTeams: 101 }),
        delta: side({ own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
      },
      rows: [
        {
          code: "gonzales:TB",
          label: "3-4U Tee Ball DYB",
          sortOrder: 1,
          inCurrent: true,
          inProposed: true,
          current: side({ own: 40, feeder: 0, pool: 40, expected: 40, minTeams: 3, maxTeams: 4 }),
          proposed: side({ own: 40, feeder: 0, pool: 40, expected: 40, minTeams: 3, maxTeams: 4 }),
          delta: side({ own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
          movers: 0,
          moversIn: split(),
          moversOut: split(),
          currentShortRoster: false,
          proposedShortRoster: false,
          currentOverlap: 0,
          proposedOverlap: 0,
          currentSharedPoolId: "chain",
          proposedSharedPoolId: "chain",
        },
        {
          code: "ascension:TB",
          label: "Tee Ball LLB",
          sortOrder: 2,
          inCurrent: true,
          inProposed: true,
          current: side({ own: 22, feeder: 0, pool: 22, expected: 22, minTeams: 2, maxTeams: 2 }),
          proposed: side({ own: 22, feeder: 0, pool: 22, expected: 22, minTeams: 2, maxTeams: 2 }),
          delta: side({ own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
          movers: 0,
          moversIn: split(),
          moversOut: split(),
          currentShortRoster: false,
          proposedShortRoster: false,
          currentOverlap: 0,
          proposedOverlap: 0,
          currentSharedPoolId: "chain",
          proposedSharedPoolId: "chain",
        },
      ],
    });

    const combined = renderToStaticMarkup(
      view({ forecast, springCombined: true, orgs: ["gonzales", "ascension"], includeFeeder: false }),
    );
    assert.doesNotMatch(combined, /data-testid="shared-pool"/);
    assert.doesNotMatch(combined, /Shared pool: 3-4U Tee Ball DYB, Tee Ball LLB/);
    assert.doesNotMatch(combined, /Counted once\. Do not add the divisions in this pool/);
    assert.doesNotMatch(combined, /data-testid="shared-pool-member"/);
    assert.match(combined, /data-testid="comparison-row" data-code="gonzales:TB"/);
    assert.match(combined, /data-testid="comparison-row" data-code="ascension:TB"/);
    assert.match(combined, /3-4U Tee Ball DYB/);
    assert.match(combined, /Tee Ball LLB/);
    assert.match(combined, /League total, each player once: current 1116 expected, teams 93–101/);
    // The hidden pool must not set the bar scale. 40 of 40 is 100; 40 of 1116 is 3.6.
    assert.match(combined, /data-bar-percent="100"/);
    assert.doesNotMatch(combined, /data-bar-percent="3\.6"/);

    const single = renderToStaticMarkup(view({ forecast, org: "ascension", orgs: ["ascension"], includeFeeder: false }));
    assert.match(single, /data-testid="shared-pool"/);
    assert.match(single, /Shared pool: 3-4U Tee Ball DYB, Tee Ball LLB/);
    assert.match(single, /Counted once\. Do not add the divisions in this pool/);
    assert.match(single, /data-testid="shared-pool-member"/);
    assert.match(single, /Tee Ball LLB/);

    const fall = renderToStaticMarkup(view({ forecast, org: "fallball", orgs: ["fallball"], includeFeeder: false }));
    assert.match(fall, /data-testid="shared-pool"/);
    assert.match(fall, /Shared pool: 3-4U Tee Ball DYB, Tee Ball LLB/);
    assert.match(fall, /data-testid="shared-pool-member"/);
    assert.doesNotMatch(fall, /data-testid="spring-comparison-section"/);
  });

  it("shows the Spring mix percent and the even-split warning", () => {
    const forecast = response({
      rows: [
        {
          code: "MAJORS",
          label: "Majors",
          sortOrder: 1,
          inCurrent: true,
          inProposed: true,
          current: side({ own: 80, feeder: 0, pool: 80, expected: 80, minTeams: 7, maxTeams: 7 }),
          proposed: side({ own: 80, feeder: 0, pool: 80, expected: 80, minTeams: 7, maxTeams: 7 }),
          delta: side({ own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
          movers: 0,
          moversIn: split(),
          moversOut: split(),
          currentShortRoster: false,
          proposedShortRoster: false,
          currentOverlap: 80,
          proposedOverlap: 80,
          currentSharedPoolId: "MAJORS+MINORS",
          proposedSharedPoolId: "MAJORS+MINORS",
          currentMix: {
            share: 80 / 300,
            sharePercent: 27,
            seasons: [2025, 2026],
            evenSplit: false,
            note: "27% of window, avg of Spring 2025\u20132026",
          },
          proposedMix: {
            share: 0.5,
            sharePercent: 50,
            seasons: [],
            evenSplit: true,
            note: "No prior Spring mix; using even split",
          },
        },
      ],
    });
    const html = renderToStaticMarkup(view({ forecast }));
    assert.match(html, /data-testid="mix-even-split"/);
    assert.match(html, /No prior Spring mix; using even split/);
    assert.doesNotMatch(html, /27% of window, avg of Spring 2025\u20132026/);
    assert.doesNotMatch(html, /data-testid="mix-share"/);
  });

  it("shows the combined Spring league share and its even-split note", () => {
    const forecast = response({
      rows: [
        {
          code: "gonzales:7U MINOR",
          label: "7U Minor Coach Pitch DYB",
          sortOrder: 1,
          inCurrent: true,
          inProposed: true,
          current: side({ own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
          proposed: side({ own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
          delta: side({ own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
          movers: 0,
          moversIn: split(),
          moversOut: split(),
          currentShortRoster: false,
          proposedShortRoster: false,
          currentOverlap: 40,
          proposedOverlap: 40,
          currentSharedPoolId: "dyb-7+llb-7",
          proposedSharedPoolId: "dyb-7+llb-7",
          currentLeagueMix: {
            league: "gonzales",
            share: 0,
            sharePercent: 0,
            seasons: [2026],
            evenSplit: false,
            note: "DYB share 0%, Spring 2026",
          },
          proposedLeagueMix: {
            league: "gonzales",
            share: 0.5,
            sharePercent: 50,
            seasons: [],
            evenSplit: true,
            note: "No prior Spring league mix; using even split",
          },
        },
      ],
    });
    const html = renderToStaticMarkup(view({ forecast }));
    assert.match(html, /data-testid="league-mix-even-split"/);
    assert.match(html, /No prior Spring league mix; using even split/);
    assert.doesNotMatch(html, /DYB share 0%, Spring 2026/);
    assert.doesNotMatch(html, /data-testid="league-mix-share"/);
  });

  it("keeps a current-only mix note under the division name", () => {
    const note = "Current windows overlap; proposed windows do not";
    const forecast = response({
      rows: [
        {
          code: "MAJORS",
          label: "Majors",
          sortOrder: 1,
          inCurrent: true,
          inProposed: true,
          current: side({ own: 80, feeder: 0, pool: 80, expected: 80, minTeams: 7, maxTeams: 7 }),
          proposed: side({ own: 40, feeder: 0, pool: 40, expected: 40, minTeams: 4, maxTeams: 4 }),
          delta: side({ own: -40, feeder: 0, pool: -40, expected: -40, minTeams: -3, maxTeams: -3 }),
          movers: 0,
          moversIn: split(),
          moversOut: split(),
          currentShortRoster: false,
          proposedShortRoster: false,
          currentOverlap: 80,
          proposedOverlap: 0,
          currentSharedPoolId: "MAJORS+MINORS",
          proposedSharedPoolId: null,
          currentMix: {
            share: 0.27,
            sharePercent: 27,
            seasons: [2026],
            evenSplit: false,
            note,
          },
          proposedMix: null,
        },
      ],
    });
    const html = renderToStaticMarkup(view({ forecast }));
    const row = html.slice(html.indexOf('data-testid="comparison-row"'));
    assert.match(row, /data-testid="mix-share"/);
    assert.match(row, new RegExp(note.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(row, /max-w-\[18rem\] truncate text-xs leading-4 text-zinc-500/);
    assert.doesNotMatch(row, /title="Own [^"]*Current windows overlap/);
    assert.match(row, /data-testid="delta-players"[^>]*>\u221240</);
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
    const anchored = withProposedCutoff(
      {
        cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
        divisions: [{ code: "8U", label: "8U", minAge: 8, maxAge: 8, sortOrder: 1, oldestBirthdate: "2018-06-01" }],
      },
      { cutoffDay: 15 },
    );
    assert.equal(anchored.divisions[0]?.oldestBirthdate, undefined);
    assert.equal(anchored.cutoff.cutoffDay, 15);
    const kept = withProposedCutoff(
      {
        cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
        divisions: [{ code: "8U", label: "8U", minAge: 8, maxAge: 8, sortOrder: 1, oldestBirthdate: "2018-06-01" }],
      },
      { cutoffDay: 30 },
    );
    assert.equal(kept.divisions[0]?.oldestBirthdate, "2018-06-01");
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

  it("renders the birthdate timeline, cutoff presets, and precise date entry", () => {
    const html = renderToStaticMarkup(view());
    assert.match(html, /data-testid="birthdate-timeline"/);
    assert.match(html, /data-testid="timeline-proposed"/);
    assert.match(html, /Little League \(Aug 31\)/);
    assert.match(html, /DYB \(Apr 30\)/);
    assert.match(html, /data-testid="cutoff-preset-custom"/);
    assert.match(html, /data-testid="age-editor-toggle"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /data-testid="age-editor-summary"[^>]*>1 division</);
    assert.match(html, /id="division-ages-age-editor" hidden=""/);
    assert.match(html, /data-testid="age-editor"/);
    assert.match(html, /Minimum age for 9U/);
    assert.match(html, /data-testid="precise-dates"/);
    assert.match(html, /data-testid="reset-proposed"/);
    assert.match(html, /born on or after May 1, 2017/);
    assert.match(html, /Keep joined boundaries together/);
    assert.equal(html.includes('data-testid="cutoff-impact"'), false);
  });

  it("places the cutoff impact under the cutoff fields once a baseline is loaded", () => {
    const baseline = proposedConfig;
    const proposed = withProposedCutoff(proposedConfig, { cutoffMonth: 8, cutoffDay: 31 });
    const html = renderToStaticMarkup(
      view({
        baseline,
        proposed,
        impactCounted: proposed,
        forecast: response(),
      }),
    );
    const timeline = html.indexOf('data-testid="birthdate-timeline"');
    const impact = html.indexOf('data-testid="cutoff-impact"');
    const tracks = html.indexOf('data-testid="timeline-strips"');
    assert.ok(timeline >= 0 && impact > timeline && tracks > impact);
    assert.match(html, /What this change does/);
    assert.match(html, /92 → 100 \(\+8\)/);
    assert.match(html, /data-testid="cutoff-impact-reset"/);
    assert.match(html, /Moving the 9U cutoff to Aug 31/);
  });

  it("shows the effective dates, edited badge, in/out movers, and where kids move", () => {
    const html = renderToStaticMarkup(
      view({
        editedCodes: ["9U"],
        editedSummary: "1 division edited",
      }),
    );
    assert.match(inputTag(html, "proposed-oldest-1"), /value="2017-05-01"/);
    assert.match(inputTag(html, "proposed-youngest-1"), /value="2018-04-30"/);
    assert.match(html, />calc</);
    assert.match(inputTag(html, "link-edges"), /checked/);
    assert.match(html, /Keep joined boundaries together/);
    assert.match(html, /1 division edited/);
    assert.match(html, /Δ players/);
    assert.match(html, /data-testid="movers-in-out"/);
    assert.match(html, /\+4 \/ −1/);
    assert.match(html, /Where kids move/);
    assert.match(html, /3 own: 10U → 9U/);
    assert.match(html, /1 feeder \(×10% share ≈ 0.1\): 10U → 9U/);
    assert.match(html, /Between divisions: current 0, proposed 0/);
    assert.match(html, /Δ players \+8/);
    assert.doesNotMatch(html, /data-testid="gap-warning"/);
  });

  it("shows a gap banner and a new overlap, and hides the built-in overlap", () => {
    const forecast = response({
      includeFeeder: false,
      proposedWarnings: [
        { kind: "gap", from: "2017-05-01", to: "2017-08-31", divisionCodes: ["9U KP", "10U KP"] },
        { kind: "overlap", from: "2018-01-01", to: "2018-04-30", divisionCodes: ["8U MINOR", "9U KP"] },
        { kind: "overlap", from: "2020-05-01", to: "2021-04-30", divisionCodes: ["6U MINOR", "6U MAJOR"] },
      ],
      currentWarnings: [
        { kind: "overlap", from: "2020-05-01", to: "2021-04-30", divisionCodes: ["6U MAJOR", "6U MINOR"] },
      ],
      proposed: {
        distinctTotal: { own: 394, feeder: 0, total: 394 },
        tooYoung: { own: 0, feeder: 0, total: 0 },
        agedOut: { own: 0, feeder: 0, total: 0 },
        unmatched: { own: 33, feeder: 7, total: 40 },
      },
    });
    const html = renderToStaticMarkup(view({ forecast, includeFeeder: false }));
    assert.match(html, /data-testid="gap-warning"/);
    assert.match(html, /33 players fall between 9U KP and 10U KP \(2017-05-01\.\.2017-08-31\) and are not counted \(this league only\)/);
    assert.match(gapWarningTag(html), /border-amber-400/);
    assert.doesNotMatch(gapWarningTag(html), /border-red-400/);
    const fallHtml = renderToStaticMarkup(view({ forecast, includeFeeder: false, org: "fallball", orgs: ["fallball"] }));
    assert.match(gapWarningTag(fallHtml), /border-red-400/);
    assert.match(fallHtml, /and are not counted\./);
    assert.doesNotMatch(fallHtml, /this league only/);
    const combinedHtml = renderToStaticMarkup(view({ forecast, includeFeeder: false, springCombined: true }));
    assert.match(gapWarningTag(combinedHtml), /border-red-400/);
    assert.doesNotMatch(combinedHtml, /this league only/);
    assert.match(html, /New overlap: 8U MINOR and 9U KP/);
    assert.doesNotMatch(html, /New overlap: 6U/);
    assert.match(html, /Between divisions: current 0, proposed 33/);
  });
});

describe("what-if editor helpers", () => {
  const cutoff = "2027-04-30";
  const divisions: DivisionAgeConfig[] = [
    { code: "8U MINOR", label: "8U Minor", minAge: 8, maxAge: 8, sortOrder: 6 },
    { code: "9U KP", label: "9U Kid Pitch", minAge: 9, maxAge: 9, sortOrder: 7 },
    { code: "10U KP", label: "10U Kid Pitch", minAge: 10, maxAge: 10, sortOrder: 8 },
    { code: "6U MINOR", label: "6U Minor", minAge: 6, maxAge: 6, sortOrder: 3 },
    { code: "6U MAJOR", label: "6U Major", minAge: 6, maxAge: 6, sortOrder: 4 },
    { code: "5U TB", label: "5U", minAge: 5, maxAge: 5, sortOrder: 2 },
    { code: "7U MINOR", label: "7U", minAge: 7, maxAge: 7, sortOrder: 5 },
  ];

  it("moves a touching older edge with the edited oldest date", () => {
    const nine = divisions.findIndex((division) => division.code === "9U KP");
    const linked = applyLinkedEdge(divisions, nine, "oldestBirthdate", "2017-09-01", cutoff, true);
    const byCode = new Map(linked.map((division) => [division.code, division]));
    assert.equal(byCode.get("9U KP")?.oldestBirthdate, "2017-09-01");
    assert.equal(byCode.get("10U KP")?.youngestBirthdate, "2017-08-31");
    assert.equal(byCode.get("8U MINOR")?.oldestBirthdate, undefined);

    const alone = applyLinkedEdge(divisions, nine, "oldestBirthdate", "2017-09-01", cutoff, false);
    const aloneByCode = new Map(alone.map((division) => [division.code, division]));
    assert.equal(aloneByCode.get("9U KP")?.oldestBirthdate, "2017-09-01");
    assert.equal(aloneByCode.get("10U KP")?.youngestBirthdate, undefined);
  });

  it("moves a shared 6U window together and the touching neighbor", () => {
    const nine = divisions.findIndex((division) => division.code === "9U KP");
    const younger = applyLinkedEdge(divisions, nine, "youngestBirthdate", "2018-08-31", cutoff, true);
    const byCode = new Map(younger.map((division) => [division.code, division]));
    assert.equal(byCode.get("9U KP")?.youngestBirthdate, "2018-08-31");
    assert.equal(byCode.get("8U MINOR")?.oldestBirthdate, "2018-09-01");

    const minor = divisions.findIndex((division) => division.code === "6U MINOR");
    const siblings = applyLinkedEdge(divisions, minor, "youngestBirthdate", "2021-01-31", cutoff, true);
    const siblingByCode = new Map(siblings.map((division) => [division.code, division]));
    assert.equal(siblingByCode.get("6U MINOR")?.youngestBirthdate, "2021-01-31");
    assert.equal(siblingByCode.get("6U MAJOR")?.youngestBirthdate, "2021-01-31");
    assert.equal(siblingByCode.get("5U TB")?.oldestBirthdate, "2021-02-01");
    assert.equal(siblingByCode.get("7U MINOR")?.youngestBirthdate, undefined);
  });

  it("keeps one division ordered and still accepts an overlapping forecast payload", () => {
    const cutoff = "2027-04-30";
    const majors = divisions.findIndex((division) => division.code === "8U MINOR");
    const inverted = applyLinkedEdge(divisions, majors, "oldestBirthdate", "2019-06-01", cutoff, true);
    const invertedByCode = new Map(inverted.map((division) => [division.code, division]));
    assert.equal(invertedByCode.get("8U MINOR")?.oldestBirthdate, "2019-04-30");
    assert.equal(invertedByCode.get("9U KP")?.youngestBirthdate, "2019-04-29");

    const overlapping: ProposedConfig = {
      cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
      divisions: [
        { code: "7U", label: "7U Minors", minAge: 7, maxAge: 7, sortOrder: 1 },
        { code: "8U", label: "8U Minors", minAge: 8, maxAge: 8, sortOrder: 2 },
        { code: "7/8 MAJ", label: "7/8 Majors", minAge: 7, maxAge: 8, sortOrder: 3 },
      ],
    };
    const body = buildForecastRequest({
      sourceSeason: 2026,
      targetSeason: 2027,
      includeFeeder: false,
      retentionOverride: null,
      proposed: overlapping,
    });
    const parsed = validateSeasonWrite(body.proposed, 2027);
    assert.equal(parsed.ok, true);

    const html = renderToStaticMarkup(
      view({
        proposed: overlapping,
        linkEdges: true,
      }),
    );
    assert.match(html, /data-testid="timeline-overlap-note"/);
    assert.match(html, /These windows overlap/);
    assert.match(html, /data-row-key="proposed-division-0"/);
    assert.match(html, /data-row-key="proposed-division-2"/);
    assert.doesNotMatch(html, /data-row-key="7\/8 Majors"/);
    assert.doesNotMatch(html, /data-row-key="7U"/);
  });

  it("keeps a draft key per org and season and describes edited divisions", () => {
    assert.equal(forecastDraftKey("gonzales", 2027), "gonzales|2027");
    const baseline: ProposedConfig = {
      cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
      divisions: [
        { code: "9U KP", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1 },
        { code: "10U KP", label: "10U", minAge: 10, maxAge: 10, sortOrder: 2 },
      ],
    };
    const edited: ProposedConfig = {
      ...baseline,
      divisions: [
        { code: "9U KP", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1, oldestBirthdate: "2017-09-01" },
        { code: "10U KP", label: "10U", minAge: 10, maxAge: 10, sortOrder: 2, youngestBirthdate: "2017-08-31" },
      ],
    };
    assert.equal(sameProposedConfig(baseline, baseline), true);
    assert.deepEqual(editedDivisionCodes(edited, baseline), ["9U KP", "10U KP"]);
    assert.equal(forecastEditedSummary(edited, baseline), "2 divisions edited");
    assert.equal(whereKidsMoveLines(
      [
        { from: "9U KP", to: "10U KP", own: 33, feeder: 7, total: 40 },
        { from: "8U MINOR", to: "9U KP", own: 0, feeder: 47, total: 47 },
      ],
      { includeFeeder: true, feederShare: 0.1 },
    )[0], "47 feeder (×10% share ≈ 4.7): 8U MINOR → 9U KP");
    assert.equal(betweenDivisionCount({ own: 33, feeder: 7, total: 40 }, false), 33);
    assert.equal(betweenDivisionCount({ own: 33, feeder: 7, total: 40 }, true), 40);
    assert.equal(
      gapWarningText(
        [{ kind: "gap", from: "2017-05-01", to: "2017-08-31", divisionCodes: ["9U KP", "10U KP"] }],
        { own: 33, feeder: 0, total: 33 },
        false,
      ),
      "33 players fall between 9U KP and 10U KP (2017-05-01..2017-08-31) and are not counted.",
    );
    assert.deepEqual(
      newOverlapMessages(
        [{ kind: "overlap", from: "2020-05-01", to: "2021-04-30", divisionCodes: ["6U MAJOR", "6U MINOR"] }],
        [{ kind: "overlap", from: "2020-05-01", to: "2021-04-30", divisionCodes: ["6U MINOR", "6U MAJOR"] }],
      ),
      [],
    );
  });

  it("combines adjacent divisions, splits one window, and renders eligibility", () => {
    const cutoff = "2027-04-30";
    const baseline: ProposedConfig = {
      cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
      divisions: [
        { code: "7U MINOR", label: "7U Minor", minAge: 7, maxAge: 7, sortOrder: 5 },
        { code: "8U MINOR", label: "8U Minor", minAge: 8, maxAge: 8, sortOrder: 6 },
        { code: "9U KP", label: "9U", minAge: 9, maxAge: 9, sortOrder: 7 },
      ],
    };
    const blocked = combineDivisions(baseline.divisions, ["7U MINOR", "9U KP"], cutoff);
    assert.equal(blocked.ok, false);
    const combined = combineDivisions(baseline.divisions, ["7U MINOR", "8U MINOR"], cutoff);
    assert.equal(combined.ok, true);
    if (!combined.ok) return;
    assert.deepEqual(
      combined.divisions.map((division) => division.code),
      ["7/8U MINOR", "9U KP"],
    );
    assert.equal(combined.divisions[0]?.minAge, 7);
    assert.equal(combined.divisions[0]?.maxAge, 8);
    assert.equal(combined.divisions[0]?.oldestBirthdate, undefined);
    assert.equal(combined.divisions[0]?.youngestBirthdate, undefined);

    const split = splitDivisionAt(baseline.divisions, "9U KP", "2017-12-31", cutoff);
    assert.equal(split.ok, true);
    if (!split.ok) return;
    const young = split.divisions.find((division) => division.code === "9U KP young");
    const old = split.divisions.find((division) => division.code === "9U KP old");
    assert.ok(young && old);
    assert.deepEqual(
      { oldest: effectiveRange(young, cutoff).oldest, youngest: effectiveRange(young, cutoff).youngest },
      { oldest: "2018-01-01", youngest: "2018-04-30" },
    );
    assert.deepEqual(
      { oldest: effectiveRange(old, cutoff).oldest, youngest: effectiveRange(old, cutoff).youngest },
      { oldest: "2017-05-01", youngest: "2017-12-31" },
    );
    assert.equal(young.sortOrder < old.sortOrder, true);

    const proposed: ProposedConfig = { ...baseline, divisions: combined.divisions };
    const forecast = response({
      rows: [
        {
          ...response().rows[0]!,
          code: "7U MINOR",
          label: "7U Minor",
          inCurrent: true,
          inProposed: false,
          current: side({ pool: 17, expected: 17, minTeams: 2, maxTeams: 2 }),
          proposed: side({ pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
        },
        {
          ...response().rows[1]!,
          code: "8U MINOR",
          label: "8U Minor",
          inCurrent: true,
          inProposed: false,
          current: side({ pool: 13, expected: 13, minTeams: 2, maxTeams: 2 }),
          proposed: side({ pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
        },
        {
          ...response().rows[0]!,
          code: "7/8U MINOR",
          label: "7/8U Minor",
          inCurrent: false,
          inProposed: true,
          current: side({ pool: 0, expected: 0, minTeams: 0, maxTeams: 0 }),
          proposed: side({ pool: 29, expected: 29, minTeams: 3, maxTeams: 3 }),
        },
      ],
      sharedPools: [],
      eligibility: [
        {
          code: "7U MINOR",
          label: "7U Minor",
          sortOrder: 5,
          minAge: 7,
          maxAge: 7,
          llOldest: "2019-09-01",
          llYoungest: "2020-08-31",
          dybOldest: "2019-05-01",
          dybYoungest: "2020-04-30",
          ll: { own: 0, feeder: 173 },
          dyb: { own: 0, feeder: 169 },
          both: { own: 0, feeder: 113 },
          llOnly: { own: 0, feeder: 60 },
          dybOnly: { own: 0, feeder: 56 },
        },
      ],
    });
    const summary = structuralScenario(baseline, proposed, forecast, 2027);
    assert.ok(summary);
    assert.equal(summary.kind, "combine");
    assert.equal(summary.exact, true);
    assert.equal(summary.beforeTotal.pool, 30);
    assert.equal(summary.afterTotal.pool, 29);
    assert.equal(summary.beforeTotal.minTeams, 4);
    assert.equal(summary.afterTotal.minTeams, 3);
    assert.equal(eligibilityShown({ own: 0, feeder: 173 }, true), 173);
    assert.equal(eligibilityShown({ own: 0, feeder: 173 }, false), 0);

    const html = renderToStaticMarkup(view({ baseline, proposed, forecast }));
    assert.match(html, /Combine selected/);
    assert.match(html, /Split division/);
    assert.match(html, /Combined vs separate/);
    assert.match(html, /Separate total/);
    assert.match(html, /Δ players -1/);
    assert.match(html, /Little League vs DYB eligibility/);
    assert.match(html, /LL-only/);
    assert.match(html, />173</);
    assert.match(html, /2019-09-01\.\.2020-08-31/);
  });
});

describe("shared pools outside the selected divisions", () => {
  const rosterFor = () => DEFAULT_ROSTER;
  const season = 2027;
  const cutoff = { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 };
  const seven = { code: "7U MINOR", label: "7U Minor", minAge: 7, maxAge: 7, sortOrder: 1 };
  const eight = { code: "8U MINOR", label: "8U Minor", minAge: 8, maxAge: 8, sortOrder: 2 };
  const major = { code: "7-8U MAJOR", label: "7-8 Major", minAge: 7, maxAge: 8, sortOrder: 3 };
  const baseline: ProposedConfig = { cutoff, divisions: [seven, eight, major] };
  const buckets: BirthBucket[] = [
    { birthDate: "2019-10-01", count: 173, pool: "own" },
    { birthDate: "2019-01-01", count: 134, pool: "own" },
  ];

  function scenarioFor(codes: string[]) {
    const combined = combineDivisions(baseline.divisions, codes, effectiveCutoffDate(cutoff, season));
    if (!combined.ok) throw new Error(combined.error);
    const proposed: ProposedConfig = { cutoff, divisions: combined.divisions };
    const compared = compareConfigs(buckets, baseline, proposed, season, {
      retentionRate: 1,
      includeFeeder: false,
      rosterFor,
    });
    const summary = structuralScenario(baseline, proposed, compared, season);
    assert.ok(summary);
    return { summary, compared, proposed };
  }

  it("does not warn when 7U and 8U do not overlap, even if 7-8 shares the pool", () => {
    const { summary, compared } = scenarioFor(["7U MINOR", "8U MINOR"]);
    assert.equal(summary.exact, true);
    assert.equal(summary.beforeTotal.pool, 307);
    assert.equal(summary.beforeTotal.expected, 307);
    assert.equal(summary.beforeTotal.minTeams, 27);
    assert.equal(summary.beforeTotal.maxTeams, 27);
    assert.equal(summary.afterTotal.pool, 307);
    assert.equal(summary.afterTotal.minTeams, 26);
    assert.equal(summary.afterTotal.maxTeams, 27);
    assert.equal(compared.league.current.pool, 307);
    assert.equal(compared.league.current.minTeams, 26);
  });

  it("counts 8U inside 7-8 once instead of adding both pools", () => {
    const { summary, compared } = scenarioFor(["8U MINOR", "7-8U MAJOR"]);
    assert.equal(summary.exact, true);
    assert.equal(summary.beforeTotal.pool, 307);
    assert.notEqual(summary.beforeTotal.pool, 134 + 307);
    assert.equal(summary.afterTotal.pool, 307);
    assert.equal(summary.afterTotal.pool - summary.beforeTotal.pool, 0);
    assert.equal(compared.league.current.pool, 307);
  });

  it("still warns when selected windows partially overlap inside a larger pool", () => {
    const narrow = {
      code: "A",
      label: "A",
      minAge: 8,
      maxAge: 8,
      sortOrder: 1,
      youngestBirthdate: "2019-03-01",
    };
    const wide = {
      code: "B",
      label: "B",
      minAge: 8,
      maxAge: 8,
      sortOrder: 2,
      oldestBirthdate: "2019-01-01",
    };
    const tail = {
      code: "C",
      label: "C",
      minAge: 8,
      maxAge: 8,
      sortOrder: 3,
      oldestBirthdate: "2019-06-01",
      youngestBirthdate: "2019-08-31",
    };
    const current: ProposedConfig = { cutoff, divisions: [narrow, wide, tail] };
    const combined = combineDivisions(current.divisions, ["A", "B"], effectiveCutoffDate(cutoff, season));
    assert.equal(combined.ok, true);
    if (!combined.ok) return;
    const proposed: ProposedConfig = { cutoff, divisions: combined.divisions };
    const compared = compareConfigs(
      [{ birthDate: "2019-02-01", count: 10, pool: "own" }, { birthDate: "2019-07-01", count: 4, pool: "own" }],
      current,
      proposed,
      season,
      { retentionRate: 1, includeFeeder: false, rosterFor },
    );
    const summary = structuralScenario(current, proposed, compared, season);
    assert.ok(summary);
    assert.equal(summary.exact, false);
    assert.ok(summary.beforeTotal.pool > 0);
  });
});

describe("stored forecast drafts", () => {
  const baseline: ProposedConfig = {
    cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
    divisions: [{ code: "8U", label: "8U", minAge: 8, maxAge: 8, sortOrder: 1 }],
  };

  it("keeps a draft while the season baseline is still loading", () => {
    const edited: ProposedConfig = {
      ...baseline,
      divisions: [{ ...baseline.divisions[0]!, oldestBirthdate: "2019-01-15" }],
    };
    assert.equal(storedDraftAction(edited, null), "save");
    assert.equal(storedDraftAction(null, null), "retain");
    assert.equal(storedDraftAction(baseline, baseline), "delete");
    assert.equal(storedDraftAction(edited, baseline), "save");
    assert.equal(storedDraftAction(null, baseline), "delete");
  });
});
