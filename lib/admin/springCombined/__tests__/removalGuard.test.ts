import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { SpringRemovalConfirm } from "@/components/admin/SpringCombinedSavePanel";
import { calculatedRange, effectiveCutoffDate } from "@/lib/ageDivisions/compute";
import type { DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";

import {
  countRemovalLinks,
  linkedRemovalTotal,
  needsRemovalConfirm,
  removalConfirmLines,
  removalImpactSentence,
  removalSaveGate,
  removedDivisionRefs,
  tallyRemovalImpacts,
  type RemovalImpact,
  type RemovedDivisionRef,
} from "../removalGuard";
import { combinedSavePreview, type SpringLeagueTable } from "../save";
import { combinedForecastConfig } from "../view";

const SEASON = 2027;
const DYB: LeagueAgeRule = { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 };
const LL: LeagueAgeRule = { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 };

function division(overrides: Partial<DivisionAgeConfig> & Pick<DivisionAgeConfig, "code" | "minAge" | "maxAge">): DivisionAgeConfig {
  return {
    label: overrides.label ?? overrides.code,
    sortOrder: overrides.sortOrder ?? 1,
    ...overrides,
  };
}

function windowFor(row: Pick<DivisionAgeConfig, "minAge" | "maxAge">, cutoff: LeagueAgeRule) {
  return calculatedRange(row, effectiveCutoffDate(cutoff, SEASON));
}

function leagues(): SpringLeagueTable[] {
  const tee = windowFor({ minAge: 4, maxAge: 6 }, DYB);
  return [
    {
      organizationId: "gonzales",
      cutoff: DYB,
      divisions: [division({ code: "8U", label: "8U", minAge: 8, maxAge: 8, sortOrder: 1 })],
    },
    {
      organizationId: "ascension",
      cutoff: LL,
      divisions: [
        division({ code: "12U", label: "12U", minAge: 12, maxAge: 12, sortOrder: 1 }),
        division({
          code: "TEE",
          label: "Tee-ball",
          minAge: 4,
          maxAge: 6,
          sortOrder: 2,
          oldestBirthdate: tee.oldest,
          youngestBirthdate: tee.youngest,
          cutoffPreset: "dyb",
        }),
        division({
          code: "8U MINOR",
          label: "Coach Pitch 8 Minor",
          minAge: 8,
          maxAge: 8,
          sortOrder: 3,
          oldestBirthdate: "2018-05-01",
          youngestBirthdate: "2019-08-31",
          cutoffPreset: "custom",
        }),
      ],
    },
  ];
}

function proposedFrom(current: readonly SpringLeagueTable[]) {
  return combinedForecastConfig(current, SEASON);
}

function impact(overrides: Partial<RemovalImpact> & Pick<RemovalImpact, "code" | "label">): RemovalImpact {
  return {
    organizationId: "ascension",
    registrations: 0,
    teams: 0,
    drafts: 0,
    ...overrides,
  };
}

describe("spring removal guard", () => {
  it("requires a second confirm when a removed division still has registrations or teams", () => {
    const current = leagues();
    const proposed = proposedFrom(current);
    proposed.divisions = proposed.divisions.filter((row) => row.code !== "ascension:8U MINOR");
    const removed = removedDivisionRefs(current, proposed);
    assert.deepEqual(removed, [
      { organizationId: "ascension", code: "8U MINOR", label: "Coach Pitch 8 Minor" },
    ]);
    const preview = combinedSavePreview(current, proposed, SEASON);
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    const removedRows = preview.preview.leagues.flatMap((league) =>
      league.changes.filter((change) => change.kind === "removed"),
    );
    assert.deepEqual(
      removedRows.map((change) => change.after),
      ["Removed"],
    );

    const counts = tallyRemovalImpacts(removed, new Map([
      [
        "ascension",
        {
          enrollments: [
            { ageGroup: "Coach Pitch 8 Minor", divisionNameRaw: "8U MINOR" },
            { ageGroup: "12U", divisionNameRaw: "coach pitch 8 minor" },
            { ageGroup: "Other", divisionNameRaw: null },
          ],
          teams: [{ ageGroup: "8U MINOR" }, { ageGroup: " 8u minor " }, { ageGroup: "12U" }],
          drafts: [{ ageGroup: "Tee-ball" }],
        },
      ],
    ]));
    assert.equal(counts[0]?.registrations, 2);
    assert.equal(counts[0]?.teams, 2);
    assert.equal(counts[0]?.drafts, 0);
    assert.equal(needsRemovalConfirm(counts), true);
    assert.equal(removalSaveGate({ removed, impacts: null }), "check");
    assert.equal(removalSaveGate({ removed, impacts: counts }), "confirm");
    assert.deepEqual(removalConfirmLines(counts), [
      "Removing Coach Pitch 8 Minor would leave 2 registrations and 2 teams on that name.",
    ]);

    const stated = impact({
      code: "8U MINOR",
      label: "Coach Pitch 8 Minor",
      registrations: 12,
      teams: 2,
    });
    assert.equal(
      removalImpactSentence(stated),
      "Removing Coach Pitch 8 Minor would leave 12 registrations and 2 teams on that name.",
    );
    assert.equal(removalSaveGate({ removed: [stated], impacts: [stated] }), "confirm");

    const html = renderToStaticMarkup(
      createElement(SpringRemovalConfirm, {
        impacts: [stated],
        saving: false,
        error: null,
        onSave: () => {},
        onBack: () => {},
      }),
    );
    assert.match(html, /data-testid="spring-removal-confirm"/);
    assert.match(html, /Removing Coach Pitch 8 Minor would leave 12 registrations and 2 teams on that name\./);
    assert.match(html, /data-testid="spring-removal-confirm-button"/);
    assert.match(html, /Registrations, teams, and drafts stay on the old name/);
    assert.doesNotMatch(html, /data-testid="spring-save-confirm"/);
  });

  it("skips the second confirm when every removed division has zero linked rows", () => {
    const removed: RemovedDivisionRef[] = [
      { organizationId: "ascension", code: "8U MINOR", label: "Coach Pitch 8 Minor" },
    ];
    const counts = countRemovalLinks(removed[0]!, {
      enrollments: [{ ageGroup: "12U", divisionNameRaw: "12U" }],
      teams: [{ ageGroup: "12U" }],
      drafts: [{ ageGroup: "12U" }],
    });
    assert.deepEqual(counts, { registrations: 0, teams: 0, drafts: 0 });
    const impacts = [{ ...removed[0]!, ...counts }];
    assert.equal(linkedRemovalTotal(impacts[0]!), 0);
    assert.equal(needsRemovalConfirm(impacts), false);
    assert.deepEqual(removalConfirmLines(impacts), []);
    assert.equal(removalSaveGate({ removed, impacts }), "save");
  });

  it("does not treat a rename as a removal", () => {
    const current = leagues();
    const proposed = proposedFrom(current);
    const renamed = proposed.divisions.find((row) => row.code === "ascension:8U MINOR");
    assert.ok(renamed);
    renamed.label = "Coach Pitch Minors";
    assert.deepEqual(removedDivisionRefs(current, proposed), []);
    const preview = combinedSavePreview(current, proposed, SEASON);
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    const removed = preview.preview.leagues.flatMap((league) => league.changes.filter((change) => change.kind === "removed"));
    assert.deepEqual(removed, []);
    assert.equal(
      preview.preview.leagues
        .flatMap((league) => league.changes)
        .some((change) => change.label === "Coach Pitch Minors" && change.kind === "changed"),
      true,
    );
    assert.equal(removalSaveGate({ removed: [], impacts: null }), "save");
  });

  it("counts a draft on the code and keeps one registration when both fields match", () => {
    const counts = countRemovalLinks(
      { code: "8U MINOR", label: "Coach Pitch 8 Minor" },
      {
        enrollments: [{ ageGroup: "Coach Pitch 8 Minor", divisionNameRaw: "8U MINOR" }],
        teams: [],
        drafts: [{ ageGroup: "8U Minor" }],
      },
    );
    assert.deepEqual(counts, { registrations: 1, teams: 0, drafts: 1 });
    assert.equal(
      removalImpactSentence({
        organizationId: "gonzales",
        code: "8U MINOR",
        label: "Coach Pitch 8 Minor",
        ...counts,
      }),
      "Removing Coach Pitch 8 Minor would leave 1 registration and 1 draft on that name.",
    );
    assert.equal(countRemovalLinks({ code: "8U", label: "8U" }, {
      enrollments: [{ ageGroup: "8U Minors", divisionNameRaw: "" }],
      teams: [],
      drafts: [],
    }).registrations, 0);
  });

  it("names the league when both leagues remove the same label", () => {
    const impacts: RemovalImpact[] = [
      impact({ organizationId: "gonzales", code: "CP", label: "Coach Pitch", registrations: 1, teams: 0, drafts: 0 }),
      impact({ organizationId: "ascension", code: "CP", label: "Coach Pitch", registrations: 4, teams: 0, drafts: 0 }),
    ];
    assert.deepEqual(removalConfirmLines(impacts), [
      "Removing Coach Pitch (Gonzales DYB) would leave 1 registration on that name.",
      "Removing Coach Pitch (Ascension LL) would leave 4 registrations on that name.",
    ]);
  });

  it("reads enrollment, team, and draft rows and does not write them", () => {
    const counts = readFileSync(new URL("../removalCounts.ts", import.meta.url), "utf8");
    const route = readFileSync(new URL("../../../../app/api/admin/division-ages/spring/linked/route.ts", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../../../../components/admin/SpringCombinedSavePanel.tsx", import.meta.url), "utf8");
    const saveRoute = readFileSync(new URL("../../../../app/api/admin/division-ages/spring/route.ts", import.meta.url), "utf8");

    assert.match(counts, /enrollment\.findMany/);
    assert.match(counts, /divisionNameRaw:\s*true/);
    assert.match(counts, /team\.findMany/);
    assert.match(counts, /draftSession\.findMany/);
    assert.match(counts, /ageGroup:\s*true/);
    assert.match(counts, /excludeRegistrationHistoryEnrollment/);
    assert.doesNotMatch(counts, /\.(delete|update|upsert|create|deleteMany|updateMany)\(/);
    assert.doesNotMatch(counts, /fallball/);

    assert.match(route, /loadRemovalImpacts/);
    assert.match(route, /organizationId: z\.enum\(\["gonzales", "ascension"\]\)/);
    assert.doesNotMatch(route, /fallball/);
    assert.doesNotMatch(route, /\.(delete|update|upsert|create|deleteMany|updateMany)\(/);

    assert.match(panel, /removalSaveGate/);
    assert.match(panel, /\/api\/admin\/division-ages\/spring\/linked/);
    const begin = panel.slice(panel.indexOf("async function beginSave"), panel.indexOf("async function undo"));
    assert.ok(begin.indexOf("removalSaveGate") < begin.indexOf("await commit()"));
    assert.match(begin, /if \(gate === "confirm"\) return/);
    assert.doesNotMatch(panel, /fallball/i);

    assert.doesNotMatch(saveRoute, /enrollment/);
    assert.doesNotMatch(saveRoute, /draftSession/);
    assert.match(saveRoute, /saveSpringCombinedDivisionAges/);
  });
});
