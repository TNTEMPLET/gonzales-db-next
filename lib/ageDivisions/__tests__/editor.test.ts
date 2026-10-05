import assert from "node:assert/strict";
import { act, createElement, useState } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { DivisionAgesEditorCard, DivisionAgesSettingsDialog, issueLines } from "@/components/admin/DivisionAgesWorkspace";

const card = {
  source: "season" as const,
  storageReady: true,
  storageNote: "Settings storage not ready. Showing built-in defaults until the division ages migration is applied.",
  cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
  divisions: [
    { code: "6U A", label: "6U A", minAge: 6, maxAge: 6, sortOrder: 1 },
    {
      code: "6U B",
      label: "6U B",
      minAge: 6,
      maxAge: 6,
      sortOrder: 2,
      oldestBirthdate: "2019-01-01",
    },
  ],
  confirmedAt: null,
  confirmedByAdminId: null,
  updatedAt: null,
  updatedByAdminId: null,
  dirty: false,
  saving: false,
  message: null,
  fieldErrors: [],
};

describe("division ages editor", () => {
  it("shows the source, an edited date, and a save button that warnings do not disable", () => {
    const html = renderToStaticMarkup(
      createElement(DivisionAgesEditorCard, {
        org: "gonzales",
        seasonYear: 2027,
        card,
        onCard: () => {},
        onSave: () => {},
        onOpenSettings: () => {},
        copyLabel: "Copy table",
        onCopy: () => {},
      }),
    );
    assert.match(html, /Saved for 2027/);
    assert.match(html, /Settings storage not ready/);
    assert.match(html, /Edited/);
    assert.match(html, /Reset to calculated/);
    assert.match(html, /Overlap/);
    assert.match(html, /Warnings do not block a save/);
    assert.match(html, /overflow-x-auto/);
    const saveButton = html.match(/<button type="button" data-testid="save-division-ages"[^>]*>/);
    assert.ok(saveButton, html);
    assert.doesNotMatch(saveButton[0], /\sdisabled(?:[\s=/>]|$)/);
  });

  it("renders a 409 with no issues as the stale-save message on the league card", () => {
    const stale = "Someone else saved changes. Reload this page to see them.";
    const payload = { error: stale, issues: [] as string[] };
    const saveLines = issueLines(payload, "Could not save division ages.");
    const resetLines = issueLines(payload, "Could not reset this season.");
    const copyLines = issueLines(payload, "Could not start from last season.");
    assert.deepEqual(saveLines, [stale]);
    assert.deepEqual(resetLines, [stale]);
    assert.deepEqual(copyLines, [stale]);
    assert.deepEqual(issueLines({ issues: [] }, "Could not save division ages."), ["Could not save division ages."]);
    assert.deepEqual(issueLines(null, "Could not save division ages."), ["Could not save division ages."]);
    assert.deepEqual(
      issueLines({ error: "Keep this", issues: ["Division code is required."] }, "Could not save division ages."),
      ["Division code is required."],
    );

    const html = renderToStaticMarkup(
      createElement(DivisionAgesEditorCard, {
        org: "gonzales",
        seasonYear: 2027,
        card: { ...card, fieldErrors: saveLines },
        onCard: () => {},
        onSave: () => {},
        onOpenSettings: () => {},
        copyLabel: "Copy table",
        onCopy: () => {},
      }),
    );
    assert.match(html, /Someone else saved changes\. Reload this page to see them\./);
  });

  it("previews the Fall Ball cutoff inside the settings cog", () => {
    const html = renderToStaticMarkup(
      createElement(DivisionAgesSettingsDialog, {
        seasonYear: 2026,
        draft: {
          org: "fallball",
          cutoffMonth: 4,
          cutoffDay: 30,
          yearOffset: 1,
          divisions: [],
          returnRatePercent: 100,
          feederSharePercent: 10,
          saving: false,
          loading: false,
          message: null,
          fieldErrors: [],
        },
        onDraft: () => {},
        onSave: () => {},
        onClose: () => {},
        onStartFromLastSeason: () => {},
        onResetSeason: () => {},
      }),
    );
    assert.match(html, /Fall 2026 → ages as of Apr 30, 2027/);
    assert.match(html, /Start from last season/);
    assert.match(html, /Reset season to league defaults/);
    assert.match(html, /Save league defaults/);
  });

  it("shows a roster size field per division and a set-all control", () => {
    const html = renderToStaticMarkup(
      createElement(DivisionAgesSettingsDialog, {
        seasonYear: 2027,
        draft: {
          org: "gonzales",
          cutoffMonth: 4,
          cutoffDay: 30,
          yearOffset: 0,
          divisions: [{ code: "9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1, rosterMin: 10, rosterMax: 14 }],
          returnRatePercent: 100,
          feederSharePercent: 10,
          saving: false,
          loading: false,
          message: null,
          fieldErrors: [],
        },
        onDraft: () => {},
        onSave: () => {},
        onClose: () => {},
        onStartFromLastSeason: () => {},
        onResetSeason: () => {},
      }),
    );
    assert.match(html, /Roster size \(min–max\)/);
    assert.match(html, /Set all/);
    assert.match(html, /data-row-key="default-division-0"/);
    assert.doesNotMatch(html, /data-row-key="9U"/);
    assert.match(html, /aria-label="Roster minimum 1"/);
    assert.match(html, /aria-label="Roster maximum 1"/);
    assert.match(html, /value="10"/);
    assert.match(html, /value="14"/);
    assert.match(html, /Blank uses the default 11–12/);
    assert.match(html, /Return rate %/);
    assert.match(html, /Feeder share %/);
    assert.match(html, /aria-label="Return rate percent"/);
    assert.match(html, /aria-label="Feeder share percent"/);
    assert.match(html, /value="100"/);
    assert.match(html, /value="10"/);
  });

  it("keeps the division name field focused while each character is typed", async () => {
    const root = await mountReact();
    try {
      const typed: string[] = [];
      function Harness() {
        const [cardState, setCardState] = useState(card);
        return createElement(DivisionAgesEditorCard, {
          org: "gonzales",
          seasonYear: 2027,
          card: cardState,
          onCard: (next) => {
            typed.push(next.divisions[0]?.label ?? "");
            setCardState(next as typeof card);
          },
          onSave: () => {},
          onOpenSettings: () => {},
          copyLabel: "Copy table",
          onCopy: () => {},
        });
      }
      await act(async () => {
        root.render(createElement(Harness));
      });
      const host = rootHost();
      const rowKey = host.querySelector("[data-row-key]")?.getAttribute("data-row-key");
      assert.equal(rowKey, "division-row-0");
      assert.notEqual(rowKey, card.divisions[0]?.code);
      assert.notEqual(rowKey, card.divisions[0]?.label);

      await typeField(host, "Label 1", "Maj");
      assert.deepEqual(typed.slice(-3), ["6U AM", "6U AMa", "6U AMaj"]);
      const label = host.querySelector('[aria-label="Label 1"]');
      assert.equal(label?.value, "6U AMaj");
      assert.equal(host.querySelector("[data-row-key]")?.getAttribute("data-row-key"), "division-row-0");

      await typeField(host, "Code 1", "XY");
      const code = host.querySelector('[aria-label="Code 1"]');
      assert.equal(code?.value, "6U AXY");
      assert.equal(host.querySelector("[data-row-key]")?.getAttribute("data-row-key"), "division-row-0");

      await typeField(host, "Minimum age 1", "2");
      const age = host.querySelector('[aria-label="Minimum age 1"]');
      assert.equal(String(age?.value), "62");
    } finally {
      await act(async () => {
        root.unmount();
      });
      restoreDom();
    }
  });
});

type Listener = (event: Event) => void;

class MiniNode {
  nodeType = 1;
  nodeName: string;
  tagName = "";
  childNodes: MiniNode[] = [];
  parentNode: MiniNode | null = null;
  ownerDocument: MiniDocument;
  attributes = new Map<string, string>();
  style: Record<string, string> = {};
  listeners = new Map<string, Set<Listener>>();
  text = "";
  value = "";
  type = "";
  namespaceURI = "http://www.w3.org/1999/xhtml";
  constructor(name: string, doc: MiniDocument) {
    this.nodeName = name.toUpperCase();
    this.tagName = this.nodeName;
    this.ownerDocument = doc;
    if (this.nodeName === "INPUT") this.type = "text";
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
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (event.bubbles && this.parentNode) this.parentNode.dispatchEvent(event);
    return true;
  }
  focus() {
    this.ownerDocument.activeElement = this;
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
  listeners = new Map<string, Set<Listener>>();
  oninput: (() => void) | null = null;
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

let installed: {
  document: unknown;
  window: unknown;
  HTMLElement: unknown;
  HTMLIFrameElement: unknown;
  Element: unknown;
  Node: unknown;
  IS_REACT_ACT_ENVIRONMENT: unknown;
} | null = null;
let hostNode: MiniNode | null = null;
let reactRoot: Root | null = null;

async function mountReact(): Promise<Root> {
  const document = new MiniDocument();
  const windowStub = {
    document,
    HTMLElement: MiniNode,
    HTMLIFrameElement: MiniIframe,
    Element: MiniNode,
    Node: MiniNode,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  document.defaultView = windowStub;
  const globals = globalThis as Record<string, unknown>;
  installed = {
    document: globals.document,
    window: globals.window,
    HTMLElement: globals.HTMLElement,
    HTMLIFrameElement: globals.HTMLIFrameElement,
    Element: globals.Element,
    Node: globals.Node,
    IS_REACT_ACT_ENVIRONMENT: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globals, {
    document,
    window: windowStub,
    HTMLElement: MiniNode,
    HTMLIFrameElement: MiniIframe,
    Element: MiniNode,
    Node: MiniNode,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  hostNode = document.createElement("div");
  document.body.appendChild(hostNode);
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
  installed = null;
  hostNode = null;
  reactRoot = null;
}

async function typeField(host: MiniNode, label: string, characters: string) {
  const input = host.querySelector(`[aria-label="${label}"]`);
  assert.ok(input, label);
  const identity = input;
  input.focus();
  let next = input.value;
  for (const character of characters) {
    next += character;
    input.value = next;
    const event = {
      type: "input",
      bubbles: true,
      target: input,
      preventDefault() {},
      stopPropagation() {},
    };
    await act(async () => {
      input.dispatchEvent(event as unknown as Event);
    });
    const again = host.querySelector(`[aria-label="${label}"]`);
    assert.equal(again, identity, `${label} remounted while typing ${characters}`);
    assert.equal(input.ownerDocument.activeElement, identity, `${label} lost focus`);
  }
}
