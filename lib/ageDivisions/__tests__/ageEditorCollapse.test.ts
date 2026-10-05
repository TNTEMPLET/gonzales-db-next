import assert from "node:assert/strict";
import { act, createElement, useState } from "react";
import type { Root } from "react-dom/client";
import { describe, it } from "node:test";

import {
  DivisionAgesForecastTimeline,
  SPRING_AGE_EDITOR_STORAGE_KEY,
} from "@/components/admin/DivisionAgesForecastTimeline";
import type { ProposedConfig } from "../forecastView";

const proposedConfig: ProposedConfig = {
  cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
  divisions: [{ code: "9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1 }],
};

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

function timelineElement(
  layout: "classic" | "spring-lanes",
  proposed: ProposedConfig,
  onDivisions: (divisions: ProposedConfig["divisions"]) => void,
) {
  return createElement(DivisionAgesForecastTimeline, {
    proposed,
    baseline: null,
    targetSeason: 2027,
    linkEdges: true,
    counts: null,
    countsLoading: false,
    onDivisions,
    onCutoff: () => {},
    onReplace: () => {},
    onLinkEdges: () => {},
    onReset: () => {},
    layout,
    leagueFallback: layout === "spring-lanes" ? "dyb" : null,
  });
}

describe("spring edit-by-age collapse", () => {
  it("keeps an age edit when the grid is collapsed and restores the open state", async () => {
    const root = await mountReact();
    try {
      let proposed = proposedConfig;
      const ageWrites: number[] = [];
      function Harness() {
        const [current, setCurrent] = useState(proposed);
        return timelineElement("spring-lanes", current, (divisions) => {
          ageWrites.push(divisions[0]?.minAge ?? -1);
          proposed = { ...current, divisions };
          setCurrent(proposed);
        });
      }
      await act(async () => {
        root.render(createElement(Harness));
      });
      const host = rootHost();
      const toggle = host.querySelector('[data-testid="age-editor-toggle"]');
      assert.ok(toggle);
      assert.equal(toggle.getAttribute("aria-expanded"), "false");
      assert.equal(toggle.getAttribute("aria-controls"), "division-ages-age-editor");
      assert.equal(host.querySelector('[data-testid="age-editor-summary"]')?.textContent, "1 division");
      const region = host.querySelector('[id="division-ages-age-editor"]');
      assert.ok(region);
      assert.equal(region.hasAttribute("hidden"), true);
      assert.equal(storage?.getItem(SPRING_AGE_EDITOR_STORAGE_KEY), null);

      await act(async () => {
        toggle.click();
      });
      assert.equal(toggle.getAttribute("aria-expanded"), "true");
      assert.equal(host.querySelector('[data-testid="age-editor-summary"]'), null);
      assert.equal(region.hasAttribute("hidden"), false);
      assert.equal(storage?.getItem(SPRING_AGE_EDITOR_STORAGE_KEY), "open");
      const minAge = host.querySelector('[aria-label="Minimum age for 9U"]');
      assert.ok(minAge);
      assert.equal(minAge.value, "9");

      minAge.value = "8";
      await act(async () => {
        minAge.dispatchEvent({
          type: "input",
          bubbles: true,
          target: minAge,
          preventDefault() {},
          stopPropagation() {},
        } as unknown as Event);
      });
      assert.deepEqual(ageWrites, [8]);
      assert.equal(proposed.divisions[0]?.minAge, 8);
      assert.equal(host.querySelector('[aria-label="Minimum age for 9U"]')?.value, "8");

      await act(async () => {
        toggle.click();
      });
      assert.equal(toggle.getAttribute("aria-expanded"), "false");
      assert.equal(region.hasAttribute("hidden"), true);
      assert.equal(proposed.divisions[0]?.minAge, 8);
      assert.equal(storage?.getItem(SPRING_AGE_EDITOR_STORAGE_KEY), "closed");

      await act(async () => {
        toggle.click();
      });
      assert.equal(host.querySelector('[aria-label="Minimum age for 9U"]')?.value, "8");
      assert.equal(proposed.divisions[0]?.maxAge, 9);
    } finally {
      await act(async () => {
        root.unmount();
      });
      restoreDom();
    }
  });

  it("opens from the saved browser preference and leaves Fall always expanded", async () => {
    const root = await mountReact();
    try {
      storage?.setItem(SPRING_AGE_EDITOR_STORAGE_KEY, "open");
      let proposed = proposedConfig;
      function SpringHarness() {
        const [current, setCurrent] = useState(proposed);
        return timelineElement("spring-lanes", current, (divisions) => {
          proposed = { ...current, divisions };
          setCurrent(proposed);
        });
      }
      await act(async () => {
        root.render(createElement(SpringHarness));
      });
      const host = rootHost();
      const toggle = host.querySelector('[data-testid="age-editor-toggle"]');
      assert.equal(toggle?.getAttribute("aria-expanded"), "true");
      assert.equal(host.querySelector('[id="division-ages-age-editor"]')?.hasAttribute("hidden"), false);
      assert.equal(storage?.getItem(SPRING_AGE_EDITOR_STORAGE_KEY), "open");

      function FallHarness() {
        const [current, setCurrent] = useState(proposedConfig);
        return timelineElement("classic", current, (divisions) => {
          setCurrent({ ...current, divisions });
        });
      }
      await act(async () => {
        root.render(createElement(FallHarness));
      });
      assert.equal(host.querySelector('[data-testid="age-editor-toggle"]'), null);
      assert.equal(host.querySelector('[data-testid="age-editor-section"]'), null);
      assert.ok(host.querySelector('[data-testid="age-editor"]'));
      assert.equal(host.querySelector('[aria-label="Minimum age for 9U"]')?.value, "9");
      assert.equal(storage?.getItem(SPRING_AGE_EDITOR_STORAGE_KEY), "open");
    } finally {
      await act(async () => {
        root.unmount();
      });
      restoreDom();
    }
  });
});
