import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bracketThemeCssVars, normalizeHex6 } from "@/lib/tournament-brackets/bracketTheme";
import {
  bracketWatermarkSrc,
  isLocalDevUploadUrl,
  resolveBracketWatermarkBase,
} from "@/lib/tournament-brackets/bracketWatermark";
import { defaultBracketSpec, mergeBracketSpec } from "@/lib/tournament-brackets/bracketSpec";

const SAMPLE = { primaryHex: "#002f6c", accentHex: "#c8102e" };

describe("bracketThemeCssVars", () => {
  it("returns light neutrals by default", () => {
    const vars = bracketThemeCssVars(SAMPLE, "light");
    assert.equal(vars["--bracket-bg"], "#eef2f7");
    assert.equal(vars["--bracket-surface"], "#ffffff");
    assert.equal(vars["--bracket-fg"], "#002f6c");
  });

  it("uses readable match meta ink on light surfaces for gold accents", () => {
    const vars = bracketThemeCssVars({ primaryHex: "#590275", accentHex: "#ffcb29" }, "light");
    assert.equal(vars["--bracket-match-badge-fg"], vars["--bracket-navy-deep"]);
    assert.equal(vars["--bracket-match-live-fg"], "#590275");
    assert.notEqual(vars["--bracket-match-badge-fg"], "#ffcb29");
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

describe("bracketWatermark", () => {
  const siteDefault = "/images/dyb-logo.png";
  const localUpload = "/uploads/tournament-brackets/foo.svg";
  const blobUrl = "https://example.blob.vercel-storage.com/foo.svg";

  it("detects local dev upload paths", () => {
    assert.equal(isLocalDevUploadUrl(localUpload), true);
    assert.equal(isLocalDevUploadUrl(siteDefault), false);
    assert.equal(isLocalDevUploadUrl(blobUrl), false);
  });

  it("falls back to site default for /uploads on Vercel", () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      assert.equal(resolveBracketWatermarkBase(localUpload, siteDefault), siteDefault);
      assert.equal(resolveBracketWatermarkBase(blobUrl, siteDefault), blobUrl);
    } finally {
      if (prev === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prev;
    }
  });

  it("uses local upload path when not on Vercel", () => {
    const prev = process.env.VERCEL;
    delete process.env.VERCEL;
    try {
      assert.equal(resolveBracketWatermarkBase(localUpload, siteDefault), localUpload);
    } finally {
      if (prev !== undefined) process.env.VERCEL = prev;
    }
  });

  it("appends cache version query param", () => {
    assert.equal(
      bracketWatermarkSrc(siteDefault, siteDefault, 123),
      `${siteDefault}?v=123`,
    );
  });
});

describe("bracket visual tuning", () => {
  it("persists game and connector offsets in bracket spec JSON", () => {
    const spec = defaultBracketSpec();
    const tuned = mergeBracketSpec(spec, {
      visualTuning: {
        games: { G8: { xPx: 2, yPx: -1.5 } },
        connectors: { "g8-champion": { xPx: 0, yPx: 3.5 } },
      },
    });

    assert.equal(tuned.visualTuning?.games?.G8?.xPx, 2);
    assert.equal(tuned.visualTuning?.games?.G8?.yPx, -1.5);
    assert.equal(tuned.visualTuning?.connectors?.["g8-champion"]?.yPx, 3.5);
  });
});
