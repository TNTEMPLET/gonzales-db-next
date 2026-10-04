import assert from "node:assert/strict";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { DivisionAgesForecastView } from "@/components/admin/DivisionAgesForecast";
import { DivisionAgesModeTabs } from "@/components/admin/DivisionAgesExplorer";
import { setAllDivisionRosters, setDivisionRoster } from "../draft";
import type { ForecastSide, PoolSplit } from "../forecast";
import {
  FORECAST_CAVEATS,
  FORECAST_DEBOUNCE_MS,
  applyLinkedEdge,
  betweenDivisionCount,
  buildForecastRequest,
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
    onDivision: () => {},
    onDivisions: () => {},
    onLinkEdges: () => {},
    onResetProposed: () => {},
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
    assert.match(html, /Move neighbor edge too/);
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
    assert.match(html, /33 players fall between 9U KP and 10U KP \(2017-05-01\.\.2017-08-31\) and are not counted/);
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

  it("moves the next-older youngest when the oldest edge moves", () => {
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

  it("moves the next-younger oldest and shared 6U windows together", () => {
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
});
