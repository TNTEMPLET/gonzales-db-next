import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bracketThemeCssVars, normalizeHex6 } from "@/lib/tournament-brackets/bracketTheme";

const SAMPLE = { primaryHex: "#002f6c", accentHex: "#c8102e" };

describe("bracketThemeCssVars", () => {
  it("returns light neutrals by default", () => {
    const vars = bracketThemeCssVars(SAMPLE, "light");
    assert.equal(vars["--bracket-bg"], "#eef2f7");
    assert.equal(vars["--bracket-surface"], "#ffffff");
    assert.equal(vars["--bracket-fg"], "#002f6c");
  });

  it("returns dark neutrals when scheme is dark", () => {
    const vars = bracketThemeCssVars(SAMPLE, "dark");
    assert.equal(vars["--bracket-bg"], "#0f172a");
    assert.equal(vars["--bracket-surface"], "#1e293b");
    assert.notEqual(vars["--bracket-bg"], "#eef2f7");
    assert.notEqual(vars["--bracket-fg"], "#002f6c");
  });

  it("keeps dark body text light for deep purple primaries", () => {
    const vars = bracketThemeCssVars({ primaryHex: "#740080", accentHex: "#ffcb29" }, "dark");
    assert.equal(vars["--bracket-muted"], "#94a3b8");
    assert.notEqual(vars["--bracket-body-emphasis"], vars["--bracket-chrome-deep"]);
    assert.match(vars["--bracket-body-emphasis"]!, /^#[ef][0-9a-f]{5}$/i);
    assert.match(vars["--bracket-body-fg"]!, /^#[cde][0-9a-f]{5}$/i);
  });

  it("returns empty object for invalid hex", () => {
    assert.deepEqual(bracketThemeCssVars({ primaryHex: "nope", accentHex: "#c8102e" }), {});
  });
});

describe("normalizeHex6", () => {
  it("normalizes 3- and 6-digit hex", () => {
    assert.equal(normalizeHex6("#abc"), "#aabbcc");
    assert.equal(normalizeHex6("002f6c"), "#002f6c");
  });
});
