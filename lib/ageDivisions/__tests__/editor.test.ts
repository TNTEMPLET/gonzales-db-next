import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { DivisionAgesEditorCard, DivisionAgesSettingsDialog } from "@/components/admin/DivisionAgesWorkspace";

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
});
