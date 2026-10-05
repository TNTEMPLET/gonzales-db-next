import assert from "node:assert/strict";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DivisionAgesForecastView } from "@/components/admin/DivisionAgesForecast";
import { DivisionAgesSpringForecastTable } from "@/components/admin/DivisionAgesSpringForecastTable";
import { EVEN_SPLIT_LEAGUE_MIX_NOTE, type LeagueMix } from "../forecastMix";
import { defaultIncludeFeeder, type ForecastResponse, type ProposedConfig } from "../forecastView";
import {
  buildSpringForecastTable,
  expectedBarPercent,
  springForecastBarPercents,
  springForecastTableSummary,
  springLeagueShareNote,
  SPRING_FORECAST_TABLE_STORAGE_KEY,
  SPRING_LEAGUE_SHARE_FOOTNOTE,
} from "../springForecastTable";

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
  extra: Partial<LeagueMix> = {},
): LeagueMix {
  return { league, share, sharePercent, seasons: [2026], evenSplit: false, note, ...extra };
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
  const zero = counts(0, 0, 0, 0);
  const mid = counts(50, 50, 4, 5);
  const top = counts(100, 100, 8, 9);
  const row = (
    code: string,
    label: string,
    sortOrder: number,
    side: ReturnType<typeof counts>,
    extra: Record<string, unknown> = {},
  ) => ({
    code,
    label,
    sortOrder,
    inCurrent: true,
    inProposed: true,
    current: side,
    proposed: side,
    delta: counts(0, 0, 0, 0),
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
      row("gonzales:TB", "3-4U Tee Ball DYB", 1, zero, {
        currentLeagueMix: mix("gonzales", 0, 0, "DYB share 0%, Spring 2026"),
        proposedLeagueMix: mix("gonzales", 0, 0, "DYB share 0%, Spring 2026"),
      }),
      row("ascension:10U", "10 Major LLB", 2, mid, {
        currentLeagueMix: mix("ascension", 0.22, 22, "LLB share 22%, Spring 2026"),
        proposedLeagueMix: mix("ascension", 0.22, 22, "LLB share 22%, Spring 2026"),
      }),
      row("ascension:CP", "Coach Pitch LLB", 3, top, {
        currentLeagueMix: mix("ascension", 1, 100, "LLB share 100%, Spring 2026"),
        proposedLeagueMix: mix("ascension", 1, 100, "LLB share 100%, Spring 2026"),
        proposedMix: {
          share: 0.25,
          sharePercent: 25,
          seasons: [2026],
          evenSplit: false,
          note: "25% of window, Spring 2026",
        },
      }),
    ],
    sharedPools: [],
    league: {
      current: counts(1200, 1200, 100, 110),
      proposed: counts(1294, 1294, 108, 116),
      delta: counts(0, 0, 0, 0),
    },
    movers: 0,
    flows: [],
    currentWarnings: [],
    proposedWarnings: [],
    eligibility: [],
    current: population(1200),
    proposed: population(1294),
  };
}

const proposedConfig: ProposedConfig = {
  cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
  divisions: [{ code: "9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1 }],
};

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

function tableSource() {
  return {
    rows: [
      {
        code: "9U",
        label: "9U Kid Pitch",
        sortOrder: 1,
        proposed: { pool: 10, expected: 10, minTeams: 1, maxTeams: 1 },
        proposedMix: { note: "100% of window, Spring 2026" },
      },
    ],
    league: { proposed: { expected: 10, minTeams: 1, maxTeams: 1 } },
  };
}

describe("spring forecast table presentation", () => {
  it("formats the collapsed summary from league totals", () => {
    assert.equal(SPRING_FORECAST_TABLE_STORAGE_KEY, "gdb-division-ages-spring-forecast-table-open");
    assert.equal(
      springForecastTableSummary({ divisionCount: 19, expected: 1294, minTeams: 108, maxTeams: 116 }),
      "19 divisions · 1,294 expected · 108\u2013116 teams",
    );
    assert.equal(
      springForecastTableSummary({ divisionCount: 1, expected: 0, minTeams: 0, maxTeams: 0 }),
      "1 division · 0 expected · 0 teams",
    );
    assert.equal(
      springForecastTableSummary({ divisionCount: 1, expected: 8, minTeams: 1, maxTeams: 1 }),
      "1 division · 8 expected · 1 team",
    );
    const model = buildSpringForecastTable({
      springCombined: true,
      leagueFallback: null,
      expected: 1294,
      minTeams: 108,
      maxTeams: 116,
      rows: sampleForecast().rows.map((row) => ({
        code: row.code,
        label: row.label,
        sortOrder: row.sortOrder,
        inWindow: row.proposed.pool,
        expected: row.proposed.expected,
        minTeams: row.proposed.minTeams,
        maxTeams: row.proposed.maxTeams,
        leagueMix: row.proposedLeagueMix,
        mixNote: row.proposedMix?.note,
      })),
    });
    assert.equal(model.summary, "3 divisions · 1,294 expected · 108\u2013116 teams");
    assert.equal(model.rows[0]?.muted, true);
    assert.equal(model.rows[0]?.barPercent, 0);
    assert.equal(model.rows[1]?.barPercent, 50);
    assert.equal(model.rows[2]?.barPercent, 100);
    assert.equal(model.rows[1]?.teamsLabel, "4\u20135");
    assert.equal(model.rows[2]?.teamsLabel, "8\u20139");
  });

  it("scales bars to the max expected, including a max of 0 and rows at 0", () => {
    assert.equal(expectedBarPercent(0, 227), 0);
    assert.equal(expectedBarPercent(12, 0), 0);
    assert.equal(expectedBarPercent(0, 0), 0);
    assert.equal(expectedBarPercent(-4, 10), 0);
    assert.equal(expectedBarPercent(227, 227), 100);
    assert.equal(expectedBarPercent(39, 227), 17.2);
    assert.deepEqual(springForecastBarPercents([0, 39, 227]), [0, 17.2, 100]);
    assert.deepEqual(springForecastBarPercents([0, 0]), [0, 0]);
  });

  it("rewrites combined league-share notes without changing the stored sentence", () => {
    const zero = mix("gonzales", 0, 0, "DYB share 0%, Spring 2026");
    const share = mix("ascension", 0.22, 22, "LLB share 22%, Spring 2026");
    const full = mix("ascension", 1, 100, "LLB share 100%, Spring 2026");
    const none = mix("ascension", 0, 0, "LLB share 0%, Spring 2026");
    const averaged = mix("gonzales", 0.35, 35, "DYB share 35%, avg of Spring 2025\u20132026", {
      seasons: [2025, 2026],
    });
    const even = mix("gonzales", 0.5, 50, EVEN_SPLIT_LEAGUE_MIX_NOTE, { seasons: [], evenSplit: true });
    assert.equal(zero.note, "DYB share 0%, Spring 2026");
    assert.equal(springLeagueShareNote(zero), "No DYB registrations at this age last Spring");
    assert.equal(springLeagueShareNote(none), "No LLB registrations at this age last Spring");
    assert.equal(springLeagueShareNote(share), "LLB 22% of kids this age last Spring");
    assert.equal(springLeagueShareNote(full), "LLB 100% of kids this age last Spring");
    assert.equal(springLeagueShareNote(averaged), "DYB 35% of kids this age, avg of Spring 2025\u20132026");
    assert.equal(springLeagueShareNote(even), EVEN_SPLIT_LEAGUE_MIX_NOTE);
    assert.equal(SPRING_LEAGUE_SHARE_FOOTNOTE.includes("last Spring's league mix"), true);
  });

  it("starts collapsed, rewords combined notes, and leaves Fall on the old table", () => {
    const combined = renderToStaticMarkup(forecastView({ springCombined: true, orgs: ["gonzales", "ascension"], includeFeeder: false }));
    assert.match(combined, /data-testid="spring-forecast-table-toggle"/);
    assert.match(combined, /aria-expanded="false"/);
    assert.match(combined, /aria-controls="division-ages-spring-forecast-table"/);
    assert.match(combined, /id="division-ages-spring-forecast-table" hidden=""/);
    assert.match(combined, /data-testid="spring-forecast-table-summary"[^>]*>3 divisions · 1,294 expected · 108–116 teams</);
    assert.match(combined, /No DYB registrations at this age last Spring/);
    assert.match(combined, /LLB 22% of kids this age last Spring/);
    assert.match(combined, /LLB 100% of kids this age last Spring/);
    assert.match(combined, /25% of window, Spring 2026/);
    assert.match(combined, /data-testid="spring-forecast-legend"/);
    assert.match(combined, /data-bar-percent="0"/);
    assert.match(combined, /data-bar-percent="50"/);
    assert.match(combined, /data-bar-percent="100"/);
    assert.doesNotMatch(combined, /DYB share /);
    assert.doesNotMatch(combined, /LLB share /);
    assert.doesNotMatch(combined, /data-testid="spring-forecast-league-footnote"/);

    const single = renderToStaticMarkup(forecastView());
    assert.match(single, /data-testid="spring-forecast-table-toggle"/);
    assert.match(single, /aria-expanded="false"/);
    assert.match(single, /DYB share 0%, Spring 2026/);
    assert.match(single, /LLB share 22%, Spring 2026/);
    assert.doesNotMatch(single, /of kids this age last Spring/);
    assert.doesNotMatch(single, /No DYB registrations at this age last Spring/);
    assert.doesNotMatch(single, /data-testid="spring-forecast-legend"/);
    assert.doesNotMatch(single, /data-testid="spring-forecast-league-footnote"/);
    assert.match(single, /25% of window, Spring 2026/);

    const fall = renderToStaticMarkup(
      forecastView({ org: "fallball", orgs: ["fallball"], includeFeeder: false }),
    );
    assert.doesNotMatch(fall, /data-testid="spring-forecast-table-section"/);
    assert.doesNotMatch(fall, /data-testid="spring-forecast-table-toggle"/);
    assert.doesNotMatch(fall, /data-testid="expected-bar"/);
    assert.doesNotMatch(fall, /data-testid="spring-forecast-legend"/);
    assert.doesNotMatch(fall, /data-testid="spring-forecast-league-footnote"/);
    assert.doesNotMatch(fall, /of kids this age last Spring/);
    assert.match(fall, /DYB share 0%, Spring 2026/);
    assert.match(fall, /<h3 class="text-sm font-semibold text-white">Edit by age<\/h3>/);
    assert.doesNotMatch(fall, /data-testid="age-editor-toggle"/);
  });
});

describe("spring forecast table collapse", () => {
  it("starts closed, remembers the open state, and shows the footnote only while open", async () => {
    const root = await mountReact();
    try {
      function Harness() {
        return createElement(DivisionAgesSpringForecastTable, {
          forecast: tableSource(),
          springCombined: true,
          leagueFallback: null,
        });
      }
      await act(async () => {
        root.render(createElement(Harness));
      });
      const host = rootHost();
      const toggle = host.querySelector('[data-testid="spring-forecast-table-toggle"]');
      assert.ok(toggle);
      assert.equal(toggle.getAttribute("aria-expanded"), "false");
      assert.equal(toggle.getAttribute("aria-controls"), "division-ages-spring-forecast-table");
      assert.equal(host.querySelector('[data-testid="spring-forecast-table-summary"]')?.textContent, "1 division · 10 expected · 1 team");
      const region = host.querySelector('[id="division-ages-spring-forecast-table"]');
      assert.ok(region);
      assert.equal(region.hasAttribute("hidden"), true);
      assert.equal(host.querySelector('[data-testid="spring-forecast-league-footnote"]'), null);
      assert.equal(storage?.getItem(SPRING_FORECAST_TABLE_STORAGE_KEY), null);

      await act(async () => {
        toggle.click();
      });
      assert.equal(toggle.getAttribute("aria-expanded"), "true");
      assert.equal(host.querySelector('[data-testid="spring-forecast-table-summary"]'), null);
      assert.equal(region.hasAttribute("hidden"), false);
      assert.equal(host.querySelector('[data-testid="spring-forecast-league-footnote"]')?.textContent, SPRING_LEAGUE_SHARE_FOOTNOTE);
      assert.equal(storage?.getItem(SPRING_FORECAST_TABLE_STORAGE_KEY), "open");
      assert.equal(host.querySelector('[data-testid="expected-bar"]')?.getAttribute("data-bar-percent"), "100");

      await act(async () => {
        toggle.click();
      });
      assert.equal(toggle.getAttribute("aria-expanded"), "false");
      assert.equal(region.hasAttribute("hidden"), true);
      assert.equal(host.querySelector('[data-testid="spring-forecast-league-footnote"]'), null);
      assert.equal(host.querySelector('[data-testid="spring-forecast-table-summary"]')?.textContent, "1 division · 10 expected · 1 team");
      assert.equal(storage?.getItem(SPRING_FORECAST_TABLE_STORAGE_KEY), "closed");
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
      storage?.setItem(SPRING_FORECAST_TABLE_STORAGE_KEY, "open");
      await act(async () => {
        root.render(
          createElement(DivisionAgesSpringForecastTable, {
            forecast: tableSource(),
            springCombined: true,
            leagueFallback: null,
          }),
        );
      });
      const host = rootHost();
      const toggle = host.querySelector('[data-testid="spring-forecast-table-toggle"]');
      assert.equal(toggle?.getAttribute("aria-expanded"), "true");
      assert.equal(host.querySelector('[id="division-ages-spring-forecast-table"]')?.hasAttribute("hidden"), false);
      assert.equal(host.querySelector('[data-testid="spring-forecast-league-footnote"]')?.textContent, SPRING_LEAGUE_SHARE_FOOTNOTE);
      assert.equal(storage?.getItem(SPRING_FORECAST_TABLE_STORAGE_KEY), "open");
    } finally {
      await act(async () => {
        root.unmount();
      });
      restoreDom();
    }
  });
});

