import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SpringCombinedDivisions from "@/components/admin/SpringCombinedDivisions";
import { builderRowViews, type BuilderTable } from "@/lib/ageDivisions/divisionBuilder";
import { trentBuilderTable } from "@/lib/ageDivisions/__tests__/trentBuilderTable";
import { formatCalendarDate } from "@/lib/ageDivisions/present";
import type { DivisionAgeConfig } from "@/lib/ageDivisions/types";
import { extractPdfText } from "@/lib/tournament-brackets/ingestion/extractPdfText";

import { springDivisionSheetRows, springDivisionsPdfFilename } from "../divisionSheet";
import { buildSpringDivisionsPdf } from "../divisionSheetPdf";
import { taggedDivisionRows, type SpringLeagueDivisions, type SpringLeagueOrg } from "../view";

function savedLeaguesFromBuilder(table: BuilderTable): SpringLeagueDivisions[] {
  const buckets: Record<SpringLeagueOrg, DivisionAgeConfig[]> = { gonzales: [], ascension: [] };
  for (const view of builderRowViews(table)) {
    const orgs: SpringLeagueOrg[] =
      view.row.charter === "dyb"
        ? ["gonzales"]
        : view.row.charter === "both"
          ? ["gonzales", "ascension"]
          : view.row.charter === "ll" || view.row.charter === "teeball"
            ? ["ascension"]
            : [];
    for (const org of orgs) {
      const list = buckets[org];
      list.push({
        code: view.row.id,
        label: view.row.name,
        minAge: view.row.minAge,
        maxAge: view.row.maxAge,
        sortOrder: list.length + 1,
        oldestBirthdate: view.window.oldest,
        youngestBirthdate: view.window.youngest,
      });
    }
  }
  return [
    {
      organizationId: "gonzales",
      cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
      divisions: buckets.gonzales,
    },
    {
      organizationId: "ascension",
      cutoff: { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 },
      divisions: buckets.ascension,
    },
  ];
}

describe("spring division sheet", () => {
  it("uses the same saved rows the Divisions tab shows, plus cutoff and printable dates", () => {
    const leagues: SpringLeagueDivisions[] = [
      {
        organizationId: "gonzales",
        cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
        divisions: [
          {
            code: "10U",
            label: "10U",
            minAge: 9,
            maxAge: 10,
            sortOrder: 1,
            cutoffPreset: "dyb",
          },
          {
            code: "8U",
            label: "8U Minors",
            minAge: 7,
            maxAge: 8,
            sortOrder: 2,
            cutoffPreset: "custom",
            oldestBirthdate: "2018-09-01",
            youngestBirthdate: "2020-04-30",
          },
        ],
      },
    ];
    const tagged = taggedDivisionRows(leagues, 2027);
    const sheet = springDivisionSheetRows(leagues, 2027);
    assert.deepEqual(
      sheet.map((row) => [row.displayName, row.oldest, row.youngest, row.ages]),
      tagged.map((row) => [
        row.displayName,
        row.oldest,
        row.youngest,
        row.minAge === row.maxAge ? `${row.minAge}U` : `${row.minAge}–${row.maxAge}`,
      ]),
    );
    assert.equal(sheet[0]?.league, "Gonzales DYB");
    assert.equal(sheet[0]?.cutoff, "DYB Apr 30");
    assert.equal(sheet[1]?.cutoff, "Custom dates");
    assert.equal(sheet[1]?.oldestLabel, formatCalendarDate("2018-09-01"));
    assert.equal(sheet[1]?.youngestLabel, formatCalendarDate("2020-04-30"));
    assert.equal(springDivisionsPdfFilename(2027), "AP-Baseball-Spring-2027-Divisions.pdf");
  });

  it("builds a three-page PDF from the saved combined rows", async () => {
    const rows = springDivisionSheetRows(savedLeaguesFromBuilder(trentBuilderTable()), 2027);
    assert.equal(rows.length, 12);
    const pdf = buildSpringDivisionsPdf({ seasonYear: 2027, rows });
    assert.equal(pdf.pageCount, 3);
    assert.equal(pdf.filename, "AP-Baseball-Spring-2027-Divisions.pdf");

    const text = await extractPdfText(pdf.buffer.slice().buffer);
    const gonzalesAt = text.indexOf("Gonzales Diamond Youth only");
    const ascensionAt = text.indexOf("Ascension Little League only");
    assert.ok(text.indexOf("Combined Divisions") >= 0);
    assert.ok(gonzalesAt > text.indexOf("Combined Divisions"));
    assert.ok(ascensionAt > gonzalesAt);
    const combined = text.slice(0, gonzalesAt);
    const gonzales = text.slice(gonzalesAt, ascensionAt);
    const ascension = text.slice(ascensionAt);

    for (const row of rows) {
      assert.ok(combined.includes(row.displayName), row.displayName);
      assert.ok(combined.includes(row.oldestLabel), row.oldestLabel);
      const page = row.organizationId === "gonzales" ? gonzales : ascension;
      const other = row.organizationId === "gonzales" ? ascension : gonzales;
      assert.ok(page.includes(row.displayName), row.displayName);
      assert.equal(other.includes(row.displayName), false, row.displayName);
    }
    assert.ok(gonzales.includes("Gonzales DYB only"));
    assert.ok(ascension.includes("Ascension LL only"));
    assert.equal(gonzales.includes("3-4 Tee Ball"), false);
    assert.equal(ascension.includes("15-17U DYB"), false);
  });

  it("keeps the Export control on the saved Divisions tab", () => {
    const html = renderToStaticMarkup(
      createElement(SpringCombinedDivisions, { defaultSeasonYear: 2027, seasonYears: [2026, 2027] }),
    );
    assert.match(html, /data-testid="spring-divisions-export-pdf"/);
    assert.match(html, /Export PDF/);
    assert.match(html, /page 1 combined, page 2 Gonzales DYB, page 3 Ascension LL/);

    const divisions = readFileSync(new URL("../../../../components/admin/SpringCombinedDivisions.tsx", import.meta.url), "utf8");
    const builder = readFileSync(new URL("../../../../components/admin/DivisionAgesBuilder.tsx", import.meta.url), "utf8");
    const page = readFileSync(new URL("../../../../app/admin/season-setup/division-ages/page.tsx", import.meta.url), "utf8");
    assert.match(divisions, /data-testid="spring-divisions-export-pdf"/);
    assert.match(divisions, /springDivisionSheetRows/);
    assert.doesNotMatch(divisions, /method:\s*"PUT"|method:\s*"POST"|method:\s*"PATCH"/);
    assert.doesNotMatch(builder, /spring-divisions-export-pdf/);
    assert.match(page, /divisions=\{\s*combined \? \(\s*<SpringCombinedDivisions/);
  });
});
