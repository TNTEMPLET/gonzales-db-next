import assert from "node:assert/strict";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DivisionAgesForecastView } from "@/components/admin/DivisionAgesForecast";
import {
  SpringComparisonDetail,
  SpringComparisonHeader,
  WithSpringComparisonState,
} from "@/components/admin/DivisionAgesSpringComparison";
import type { LeagueMix } from "../forecastMix";
import { defaultIncludeFeeder, type ForecastResponse, type ProposedConfig } from "../forecastView";
import {
  buildSpringComparisonBars,
  comparisonBarPercent,
  comparisonBarScale,
  comparisonDeltaSign,
  comparisonRowNotes,
  formatComparisonDelta,
  formatComparisonTeamDelta,
  springComparisonSummary,
  SPRING_COMPARISON_PANEL_ID,
  SPRING_COMPARISON_STORAGE_KEY,
} from "../springComparison";

type Listener = (event: Event) => void;

class MiniNode {
  nodeType = 1;
  nodeName: string;
  tagName = "";
  childNodes: MiniNode[] = [];
  parentNode: MiniNode | null = null;
  ownerDocument: MiniDocument;
  attributes = new Map<string, string>();
  style: Record<string, string> & { setProperty?: (name: string, value: string) => void } = {};
  listeners = new Map<string, Set<Listener>>();
  text = "";
  value = "";
  type = "";
  disabled = false;
  selected = false;
  clientWidth = 0;
  scrollLeft = 0;
  namespaceURI = "http://www.w3.org/1999/xhtml";
  constructor(name: string, doc: MiniDocument) {
    this.nodeName = name.toUpperCase();
    this.tagName = this.nodeName;
    this.ownerDocument = doc;
    this.style.setProperty = (name: string, value: string) => {
      this.style[name] = value;
    };
    if (this.nodeName === "INPUT") this.type = "text";
  }
  get options(): MiniNode[] {
    const opts: MiniNode[] = [];
    const walk = (node: MiniNode) => {
      if (node.nodeName === "OPTION") opts.push(node);
      for (const child of node.childNodes) walk(child);
    };
    for (const child of this.childNodes) walk(child);
    return opts;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get nextSibling() {
    const kids = this.parentNode?.childNodes ?? [];
    return kids[kids.indexOf(this) + 1] ?? null;
  }
  appendChild(child: MiniNode) {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  insertBefore(child: MiniNode, before: MiniNode | null) {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    const index = before ? this.childNodes.indexOf(before) : -1;
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
    return child;
  }
  removeChild(child: MiniNode) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
    if (name === "type") this.type = String(value);
    if (name === "value") this.value = String(value);
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatchEvent(event: Event): boolean {
    const hosted = event as Event & { target: EventTarget | null };
    if (!hosted.target) hosted.target = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    const bubbles = (event as Event & { bubbles?: boolean }).bubbles !== false;
    if (bubbles && this.parentNode) this.parentNode.dispatchEvent(event);
    return true;
  }
  click() {
    const event = {
      type: "click",
      bubbles: true,
      cancelable: true,
      target: this,
      currentTarget: null,
      button: 0,
      preventDefault() {},
      stopPropagation() {},
    };
    this.dispatchEvent(event as unknown as Event);
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  getBoundingClientRect() {
    return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return {}; } };
  }
  contains(node: MiniNode | null): boolean {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }
  get textContent() {
    return this.text + this.childNodes.map((child) => child.textContent).join("");
  }
  set textContent(value: string) {
    this.text = value;
    this.childNodes = [];
  }
  querySelector(selector: string): MiniNode | null {
    const attribute = /\[([\w-]+)(?:="([^"]*)")?\]/.exec(selector);
    const found: MiniNode[] = [];
    const walk = (node: MiniNode) => {
      if (attribute) {
        const actual = node.getAttribute(attribute[1]!);
        const expected = attribute[2];
        if (expected === undefined ? actual != null : actual === expected) found.push(node);
      }
      for (const child of node.childNodes) walk(child);
    };
    walk(this);
    return found[0] ?? null;
  }
}

class MiniDocument {
  nodeType = 9;
  documentElement: MiniNode;
  body: MiniNode;
  activeElement: MiniNode | null = null;
  defaultView: object | null = null;
  onclick: (() => void) | null = null;
  oninput: (() => void) | null = null;
  onchange: (() => void) | null = null;
  listeners = new Map<string, Set<Listener>>();
  constructor() {
    this.documentElement = new MiniNode("html", this);
    this.body = new MiniNode("body", this);
    this.documentElement.appendChild(this.body);
  }
  createElement(name: string) {
    const node = new MiniNode(name, this);
    if (name === "#text") node.nodeType = 3;
    return node;
  }
  createElementNS(_namespace: string, name: string) {
    return this.createElement(name);
  }
  createTextNode(text: string) {
    const node = this.createElement("#text");
    node.text = text;
    return node;
  }
  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }
}

class MiniIframe {}

class MemoryStorage {
  private saved = new Map<string, string>();
  getItem(key: string) {
    return this.saved.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.saved.set(key, String(value));
  }
  removeItem(key: string) {
    this.saved.delete(key);
  }
  clear() {
    this.saved.clear();
  }
}

let installed: Record<string, unknown> | null = null;
let navigatorDescriptor: PropertyDescriptor | null = null;
let hostNode: MiniNode | null = null;
let reactRoot: Root | null = null;
let storage: MemoryStorage | null = null;

async function mountReact(): Promise<Root> {
  const document = new MiniDocument();
  storage = new MemoryStorage();
  const navigatorStub = { userAgent: "node" };
  const windowStub: Record<string, unknown> = {
    document,
    localStorage: storage,
    HTMLElement: MiniNode,
    HTMLIFrameElement: MiniIframe,
    Element: MiniNode,
    Node: MiniNode,
    navigator: navigatorStub,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    CSS: { escape: (value: string) => value },
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  windowStub.top = windowStub;
  windowStub.self = windowStub;
  document.defaultView = windowStub;
  const globals = globalThis as Record<string, unknown>;
  installed = {
    document: globals.document,
    window: globals.window,
    HTMLElement: globals.HTMLElement,
    HTMLIFrameElement: globals.HTMLIFrameElement,
    Element: globals.Element,
    Node: globals.Node,
    ResizeObserver: globals.ResizeObserver,
    CSS: globals.CSS,
    IS_REACT_ACT_ENVIRONMENT: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  // Node 21+ exposes navigator as a getter-only accessor; assign/set throws in ESM.
  navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator") ?? null;
  Object.assign(globals, {
    document,
    window: windowStub,
    HTMLElement: MiniNode,
    HTMLIFrameElement: MiniIframe,
    Element: MiniNode,
    Node: MiniNode,
    ResizeObserver: windowStub.ResizeObserver,
    CSS: windowStub.CSS,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: navigatorStub,
    configurable: true,
    writable: true,
    enumerable: true,
  });
  hostNode = document.createElement("div");
  document.body.appendChild(hostNode);
  // React's client build reads navigator.userAgent at import time (Node 20 has none).
  const { createRoot } = await import("react-dom/client");
  reactRoot = createRoot(hostNode as unknown as Element);
  return reactRoot;
}

function rootHost(): MiniNode {
  if (!hostNode) throw new Error("missing host");
  return hostNode;
}

function restoreDom() {
  if (!installed) return;
  const globals = globalThis as Record<string, unknown>;
  for (const [key, value] of Object.entries(installed)) {
    if (value === undefined) delete globals[key];
    else globals[key] = value;
  }
  if (navigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  } else {
    delete (globalThis as { navigator?: unknown }).navigator;
  }
  navigatorDescriptor = null;
  installed = null;
  hostNode = null;
  reactRoot = null;
  storage = null;
}


function mix(
  league: LeagueMix["league"],
  share: number,
  sharePercent: number,
  note: string,
): LeagueMix {
  return { league, share, sharePercent, seasons: [2026], evenSplit: false, note };
}

function counts(pool: number, expected: number, minTeams: number, maxTeams: number) {
  return { own: pool, feeder: 0, pool, expected, minTeams, maxTeams };
}

function emptySplit() {
  return { own: 0, feeder: 0, total: 0 };
}

function population(total: number) {
  const split = { own: total, feeder: 0, total };
  return { distinctTotal: split, tooYoung: emptySplit(), agedOut: emptySplit(), unmatched: emptySplit() };
}

function sampleForecast(): ForecastResponse {
  const row = (
    code: string,
    label: string,
    sortOrder: number,
    current: ReturnType<typeof counts>,
    proposed: ReturnType<typeof counts>,
    extra: Record<string, unknown> = {},
  ) => ({
    code,
    label,
    sortOrder,
    inCurrent: true,
    inProposed: true,
    current,
    proposed,
    delta: counts(
      proposed.pool - current.pool,
      proposed.expected - current.expected,
      proposed.minTeams - current.minTeams,
      proposed.maxTeams - current.maxTeams,
    ),
    movers: 0,
    moversIn: emptySplit(),
    moversOut: emptySplit(),
    currentShortRoster: false,
    proposedShortRoster: false,
    currentOverlap: 0,
    proposedOverlap: 0,
    currentSharedPoolId: null,
    proposedSharedPoolId: null,
    ...extra,
  });
  return {
    organizationId: "gonzales",
    seasonYear: 2026,
    targetSeasonYear: 2027,
    includeFeeder: false,
    feederShare: 0,
    notes: [],
    source: "enrollment",
    coveragePct: 100,
    sources: {
      own: { source: "enrollment", players: 150, datedPlayers: 150, coveragePct: 100 },
      feeder: { source: "enrollment", players: 0, datedPlayers: 0, coveragePct: null },
    },
    carryover: { springDistinct: 0, carried: 0, rate: null, note: null },
    retention: { applied: 1, source: "default" },
    currentSource: "league",
    proposedSource: "request",
    rows: [
      row("gonzales:TB", "3-4U Tee Ball DYB", 1, counts(0, 0, 0, 0), counts(0, 0, 0, 0), {
        currentLeagueMix: mix("gonzales", 0, 0, "DYB share 0%, Spring 2026"),
        proposedLeagueMix: mix("gonzales", 0, 0, "DYB share 0%, Spring 2026"),
      }),
      row("ascension:10U", "10 Major LLB", 2, counts(40, 40, 3, 4), counts(80, 80, 6, 7), {
        currentLeagueMix: mix("ascension", 0.22, 22, "LLB share 22%, Spring 2026"),
        proposedLeagueMix: mix("ascension", 0.22, 22, "LLB share 22%, Spring 2026"),
      }),
      row("ascension:CP", "Coach Pitch LLB", 3, counts(100, 100, 8, 9), counts(200, 200, 16, 18), {
        proposedMix: { share: 0.25, sharePercent: 25, seasons: [2026], evenSplit: false, note: "25% of window, Spring 2026" },
      }),
      row("gonzales:12U", "12U DYB", 4, counts(80, 80, 6, 7), counts(60, 60, 5, 6)),
    ],
    sharedPools: [],
    league: {
      current: counts(1294, 1294, 108, 116),
      proposed: counts(1310, 1310, 110, 118),
      delta: counts(16, 16, 2, 2),
    },
    movers: 0,
    flows: [],
    currentWarnings: [],
    proposedWarnings: [],
    eligibility: [],
    current: population(1294),
    proposed: population(1310),
  };
}

const proposedConfig: ProposedConfig = {
  cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
  divisions: [{ code: "9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1 }],
};

const SUMMARY = "Current 1,294 · Proposed 1,310 · +16 players · teams 108\u2013116 → 110\u2013118";

function forecastView(overrides: Partial<Parameters<typeof DivisionAgesForecastView>[0]> = {}) {
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
    retentionHint: null,
    proposed: proposedConfig,
    currentSourceLabel: "League defaults",
    forecast: sampleForecast(),
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

describe("spring comparison presentation", () => {
  it("formats the collapsed summary from league totals and drops missing teams", () => {
    assert.equal(SPRING_COMPARISON_STORAGE_KEY, "gdb-division-ages-spring-current-vs-proposed-open");
    assert.equal(SPRING_COMPARISON_PANEL_ID, "division-ages-spring-current-vs-proposed");
    assert.equal(
      springComparisonSummary({
        current: 1294,
        proposed: 1310,
        delta: 16,
        currentTeams: { min: 108, max: 116 },
        proposedTeams: { min: 110, max: 118 },
      }),
      SUMMARY,
    );
    assert.equal(
      springComparisonSummary({ current: 10, proposed: 12, delta: 2 }),
      "Current 10 · Proposed 12 · +2 players",
    );
    assert.equal(
      springComparisonSummary({
        current: 10,
        proposed: 8,
        delta: -2,
        currentTeams: { min: Number.NaN, max: 4 },
        proposedTeams: { min: 3, max: 4 },
      }),
      "Current 10 · Proposed 8 · \u22122 players",
    );
    assert.equal(
      springComparisonSummary({ current: Number.NaN, proposed: 0, delta: 0, currentTeams: null, proposedTeams: null }),
      "Current 0 · Proposed 0 · 0 players",
    );
  });

  it("scales both bars to the shared max, including max 0 and NaN", () => {
    assert.equal(comparisonBarPercent(0, 200), 0);
    assert.equal(comparisonBarPercent(12, 0), 0);
    assert.equal(comparisonBarPercent(0, 0), 0);
    assert.equal(comparisonBarPercent(-4, 10), 0);
    assert.equal(comparisonBarPercent(Number.NaN, 200), 0);
    assert.equal(comparisonBarPercent(40, Number.NaN), 0);
    assert.equal(comparisonBarPercent(200, 200), 100);
    assert.equal(comparisonBarPercent(39, 227), 17.2);
    assert.deepEqual(comparisonBarScale([{ current: 0, proposed: 0 }]), [{ current: 0, proposed: 0 }]);
    assert.deepEqual(
      comparisonBarScale([
        { current: Number.NaN, proposed: Number.NaN },
        { current: 0, proposed: 0 },
      ]),
      [
        { current: 0, proposed: 0 },
        { current: 0, proposed: 0 },
      ],
    );
    assert.deepEqual(
      comparisonBarScale([
        { current: 40, proposed: 80 },
        { current: 100, proposed: 200 },
        { current: 80, proposed: 60 },
      ]),
      [
        { current: 20, proposed: 40 },
        { current: 50, proposed: 100 },
        { current: 40, proposed: 30 },
      ],
    );
    const slots = buildSpringComparisonBars({
      leagueFallback: null,
      entries: [
        {
          key: "gonzales:TB",
          code: "gonzales:TB",
          label: "Tee Ball DYB",
          current: counts(0, 0, 0, 0),
          proposed: counts(0, 0, 0, 0),
        },
        {
          key: "ascension:CP",
          code: "ascension:CP",
          label: "Coach Pitch LLB",
          current: counts(100, 100, 8, 9),
          proposed: counts(200, 200, 16, 18),
        },
      ],
    });
    assert.equal(slots["gonzales:TB"]?.muted, true);
    assert.equal(slots["gonzales:TB"]?.currentPercent, 0);
    assert.equal(slots["ascension:CP"]?.muted, false);
    assert.equal(slots["ascension:CP"]?.league, "llb");
    assert.equal(slots["ascension:CP"]?.proposedPercent, 100);
  });

  it("formats the delta with a sign and a real minus", () => {
    assert.equal(formatComparisonDelta(12), "+12");
    assert.equal(formatComparisonDelta(-5), "\u22125");
    assert.equal(formatComparisonDelta(0), "0");
    assert.equal(formatComparisonDelta(-0), "0");
    assert.equal(formatComparisonDelta(Number.NaN), "0");
    assert.equal(formatComparisonDelta(1294), "+1,294");
    assert.equal(formatComparisonDelta(-1200), "\u22121,200");
    assert.equal(comparisonDeltaSign(12), "positive");
    assert.equal(comparisonDeltaSign(-5), "negative");
    assert.equal(comparisonDeltaSign(0), "zero");
    assert.equal(comparisonDeltaSign(Number.NaN), "zero");
  });

  it("formats a team-range delta as one sign or a signed range", () => {
    assert.equal(formatComparisonTeamDelta(1, 1), "+1");
    assert.equal(formatComparisonTeamDelta(-2, -2), "\u22122");
    assert.equal(formatComparisonTeamDelta(0, 0), "0");
    assert.equal(formatComparisonTeamDelta(-0, 0), "0");
    assert.equal(formatComparisonTeamDelta(Number.NaN, Number.NaN), "0");
    assert.equal(formatComparisonTeamDelta(0, 1), "+0 to +1");
    assert.equal(formatComparisonTeamDelta(1, 0), "+1 to +0");
    assert.equal(formatComparisonTeamDelta(-1, 2), "\u22121 to +2");
    assert.equal(formatComparisonTeamDelta(1, -1), "+1 to \u22121");
  });

  it("shows each row note once, preferring the proposed sentence", () => {
    const same = comparisonRowNotes(
      { note: "LLB 22% of kids this age last Spring", evenSplit: false },
      { note: "LLB 22% of kids this age last Spring", evenSplit: false },
      { note: "75% of window, Spring 2026", evenSplit: false },
      { note: "75% of window, Spring 2026", evenSplit: false },
    );
    assert.deepEqual(
      same.map((note) => note.note),
      ["LLB 22% of kids this age last Spring", "75% of window, Spring 2026"],
    );
    const differed = comparisonRowNotes(
      { note: "DYB share 0%, Spring 2026", evenSplit: false },
      { note: "No prior Spring league mix; using even split", evenSplit: true },
      { note: "27% of window, avg of Spring 2025\u20132026", evenSplit: false },
      { note: "No prior Spring mix; using even split", evenSplit: true },
    );
    assert.deepEqual(
      differed.map((note) => [note.note, note.testId]),
      [
        ["No prior Spring league mix; using even split", "league-mix-even-split"],
        ["No prior Spring mix; using even split", "mix-even-split"],
      ],
    );
    assert.deepEqual(comparisonRowNotes({ note: "current only", evenSplit: false }, null, null, null), [
      { note: "current only", evenSplit: false, testId: "league-mix-share" },
    ]);
    assert.deepEqual(
      comparisonRowNotes(null, { note: "   ", evenSplit: false }, { note: "Current windows overlap", evenSplit: false }, null),
      [{ note: "Current windows overlap", evenSplit: false, testId: "mix-share" }],
    );
    assert.deepEqual(comparisonRowNotes({ note: "  ", evenSplit: false }, null, null, null), []);
  });

  it("starts collapsed on Spring and leaves Fall on the existing table", () => {
    const combined = renderToStaticMarkup(
      forecastView({ springCombined: true, orgs: ["gonzales", "ascension"], includeFeeder: false }),
    );
    assert.match(combined, /data-testid="spring-comparison-toggle"/);
    assert.match(combined, /aria-expanded="false"/);
    assert.match(combined, /aria-controls="division-ages-spring-current-vs-proposed"/);
    assert.match(combined, /id="division-ages-spring-current-vs-proposed" hidden=""/);
    assert.match(combined, /data-testid="spring-comparison-summary"[^>]*>Current 1,294 · Proposed 1,310 · \+16 players · teams 108–116 → 110–118</);
    assert.match(combined, /data-testid="spring-comparison-legend"/);
    assert.match(combined, /data-bar-percent="0"/);
    assert.match(combined, /data-bar-percent="20"/);
    assert.match(combined, /data-bar-percent="40"/);
    assert.match(combined, /data-bar-percent="50"/);
    assert.match(combined, /data-bar-percent="100"/);
    assert.match(combined, /data-bar-percent="30"/);
    assert.match(combined, /data-testid="comparison-bar-current"/);
    assert.match(combined, /data-testid="comparison-bar-proposed"/);
    assert.match(combined, /data-delta-sign="negative"/);
    assert.match(combined, /\u221220/);
    assert.match(combined, /data-testid="delta-players"[^>]*>\u221220</);
    assert.doesNotMatch(combined, /data-testid="delta-players"[^>]*>-20</);
    assert.match(combined, /data-delta-sign="positive"/);
    assert.match(combined, /data-muted="true"/);
    assert.match(combined, /max-w-\[18rem\] truncate text-xs leading-4 text-zinc-500/);
    assert.doesNotMatch(combined, /text-sky-200/);
    assert.match(combined, /No DYB registrations at this age last Spring/);
    assert.match(combined, /LLB 22% of kids this age last Spring/);
    assert.match(combined, /25% of window, Spring 2026/);
    assert.doesNotMatch(combined, /DYB share /);
    assert.doesNotMatch(combined, /LLB share /);

    const single = renderToStaticMarkup(forecastView());
    assert.match(single, /data-testid="spring-comparison-toggle"/);
    assert.match(single, /aria-expanded="false"/);
    assert.match(single, new RegExp(SUMMARY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(single, /data-testid="spring-comparison-legend"/);
    assert.match(single, /DYB share 0%, Spring 2026/);
    assert.match(single, /LLB share 22%, Spring 2026/);
    assert.doesNotMatch(single, /of kids this age last Spring/);
    assert.match(single, /data-testid="comparison-bar-proposed"/);

    const fall = renderToStaticMarkup(forecastView({ org: "fallball", orgs: ["fallball"], includeFeeder: false }));
    assert.match(fall, /<h2 class="text-xl font-semibold text-white">Current vs proposed<\/h2>/);
    assert.match(fall, /data-testid="forecast-table"/);
    assert.doesNotMatch(fall, /data-testid="spring-comparison-section"/);
    assert.doesNotMatch(fall, /data-testid="spring-comparison-toggle"/);
    assert.doesNotMatch(fall, /data-testid="spring-comparison-summary"/);
    assert.doesNotMatch(fall, /data-testid="comparison-bar-current"/);
    assert.doesNotMatch(fall, /data-testid="comparison-bar-proposed"/);
    assert.doesNotMatch(fall, /data-testid="comparison-delta"/);
    assert.doesNotMatch(fall, /data-testid="spring-comparison-legend"/);
    assert.doesNotMatch(fall, /of kids this age last Spring/);
    assert.match(fall, /DYB share 0%, Spring 2026/);
    assert.match(fall, /text-sky-200/);
    assert.match(fall, /data-testid="delta-players"[^>]*>-20</);
    assert.doesNotMatch(fall, /data-testid="delta-players"[^>]*>\u221220</);
    assert.doesNotMatch(fall, /data-testid="comparison-team-delta"/);
    assert.match(fall, /<h3 class="text-sm font-semibold text-white">Edit by age<\/h3>/);
  });
});

describe("spring comparison collapse", () => {
  it("starts closed and remembers the open state", async () => {
    const root = await mountReact();
    try {
      function Harness() {
        return createElement(WithSpringComparisonState, {
          enabled: true,
          children: [
            createElement(SpringComparisonHeader, { summary: SUMMARY, loading: false }),
            createElement(SpringComparisonDetail, {
              spring: true,
              springCombined: true,
              children: createElement("p", { "data-testid": "comparison-panel-body" }, "table"),
            }),
          ],
        });
      }
      await act(async () => {
        root.render(createElement(Harness));
      });
      const host = rootHost();
      const toggle = host.querySelector('[data-testid="spring-comparison-toggle"]');
      assert.ok(toggle);
      assert.equal(toggle.getAttribute("aria-expanded"), "false");
      assert.equal(toggle.getAttribute("aria-controls"), SPRING_COMPARISON_PANEL_ID);
      assert.equal(host.querySelector('[data-testid="spring-comparison-summary"]')?.textContent, SUMMARY);
      const region = host.querySelector(`[id="${SPRING_COMPARISON_PANEL_ID}"]`);
      assert.ok(region);
      assert.equal(region.hasAttribute("hidden"), true);
      assert.equal(storage?.getItem(SPRING_COMPARISON_STORAGE_KEY), null);

      await act(async () => {
        toggle.click();
      });
      assert.equal(toggle.getAttribute("aria-expanded"), "true");
      assert.equal(host.querySelector('[data-testid="spring-comparison-summary"]'), null);
      assert.equal(region.hasAttribute("hidden"), false);
      assert.equal(host.querySelector('[data-testid="comparison-panel-body"]')?.textContent, "table");
      assert.equal(host.querySelector('[data-testid="spring-comparison-legend"]')?.textContent?.includes("DYB (Gonzales)"), true);
      assert.equal(storage?.getItem(SPRING_COMPARISON_STORAGE_KEY), "open");

      await act(async () => {
        toggle.click();
      });
      assert.equal(toggle.getAttribute("aria-expanded"), "false");
      assert.equal(region.hasAttribute("hidden"), true);
      assert.equal(host.querySelector('[data-testid="spring-comparison-summary"]')?.textContent, SUMMARY);
      assert.equal(storage?.getItem(SPRING_COMPARISON_STORAGE_KEY), "closed");
    } finally {
      await act(async () => {
        root.unmount();
      });
      restoreDom();
    }
  });

  it("opens from the saved browser preference", async () => {
    const root = await mountReact();
    try {
      storage?.setItem(SPRING_COMPARISON_STORAGE_KEY, "open");
      await act(async () => {
        root.render(
          createElement(WithSpringComparisonState, {
            enabled: true,
            children: [
              createElement(SpringComparisonHeader, { summary: SUMMARY, loading: false }),
              createElement(SpringComparisonDetail, {
                spring: true,
                springCombined: false,
                children: createElement("p", null, "open"),
              }),
            ],
          }),
        );
      });
      const host = rootHost();
      const toggle = host.querySelector('[data-testid="spring-comparison-toggle"]');
      assert.equal(toggle?.getAttribute("aria-expanded"), "true");
      assert.equal(host.querySelector(`[id="${SPRING_COMPARISON_PANEL_ID}"]`)?.hasAttribute("hidden"), false);
      assert.equal(host.querySelector('[data-testid="spring-comparison-legend"]'), null);
      assert.equal(storage?.getItem(SPRING_COMPARISON_STORAGE_KEY), "open");
    } finally {
      await act(async () => {
        root.unmount();
      });
      restoreDom();
    }
  });
});
