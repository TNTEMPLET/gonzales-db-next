import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import { DivisionAgesCutoffImpact } from "@/components/admin/DivisionAgesCutoffImpact";
import { teamCountRange, type BirthBucket, type RosterSize } from "../forecast";
import {
  buildCutoffImpact,
  formatImpactPlayers,
  formatWindowShift,
  type DivisionImpact,
} from "../cutoffImpact";
import type { ProposedConfig } from "../forecastView";

const SEASON = 2027;

function division(
  code: string,
  label: string,
  minAge: number,
  maxAge: number,
  sortOrder: number,
  overrides: { oldestBirthdate?: string; youngestBirthdate?: string } = {},
) {
  return { code, label, minAge, maxAge, sortOrder, ...overrides };
}

function minors(cutoff: { cutoffMonth: number; cutoffDay: number }): ProposedConfig {
  return {
    cutoff: { ...cutoff, yearOffset: 0 },
    divisions: [
      division("7U MINOR", "7U Minors", 7, 7, 1),
      division("8U MINOR", "8U Minors", 8, 8, 2),
      division("9U KP", "9U Kid Pitch", 9, 9, 3),
    ],
  };
}

function bucket(birthDate: string, count: number): BirthBucket {
  return { birthDate, count, pool: "own" };
}

/** A day in the following month, still on the young side of both cutoff dates. */
function stayDate(boundary: string, yearsBack: number): string {
  const year = Number(boundary.slice(0, 4)) - yearsBack;
  const month = Number(boundary.slice(5, 7)) + 1;
  const stayMonth = month > 12 ? 1 : month;
  const stayYear = month > 12 ? year + 1 : year;
  return `${String(stayYear).padStart(4, "0")}-${String(stayMonth).padStart(2, "0")}-15`;
}

/**
 * 42 players in 7U (35 stay, 7 sit on the day that ages up), 36 stay in 8U,
 * and 20 stay in 9U. The 7 boundary birthdays are the only ones who move.
 */
function boundaryBuckets(boundary: string): BirthBucket[] {
  return [
    bucket(boundary, 7),
    bucket(stayDate(boundary, 0), 35),
    bucket(stayDate(boundary, 1), 36),
    bucket(stayDate(boundary, 2), 20),
  ];
}

function byCode(divisions: readonly DivisionImpact[], code: string): DivisionImpact {
  const found = divisions.find((division) => division.code === code);
  assert.ok(found, `missing ${code}`);
  return found;
}

function assertSevenEightShift(impact: ReturnType<typeof buildCutoffImpact>, leaving: string, entering: string) {
  assert.equal(impact.changed, true);
  assert.equal(
    impact.divisions.map((division) => division.code).join(","),
    "7U MINOR,8U MINOR",
  );
  const seven = byCode(impact.divisions, "7U MINOR");
  const eight = byCode(impact.divisions, "8U MINOR");
  assert.equal(formatImpactPlayers(seven.beforePlayers, seven.afterPlayers), "42 → 35 (−7)");
  assert.equal(seven.beforePlayers, 42);
  assert.equal(seven.afterPlayers, 35);
  assert.equal(seven.playerDelta, -7);
  assert.equal(eight.beforePlayers, 36);
  assert.equal(eight.afterPlayers, 43);
  assert.equal(eight.playerDelta, 7);
  assert.deepEqual(
    { min: seven.beforeMinTeams, max: seven.beforeMaxTeams },
    { min: teamCountRange(42, { min: 11, max: 12 }).minTeams, max: teamCountRange(42, { min: 11, max: 12 }).maxTeams },
  );
  assert.equal(seven.beforeMinTeams, 4);
  assert.equal(seven.beforeMaxTeams, 4);
  assert.equal(seven.afterMinTeams, 3);
  assert.equal(seven.afterMaxTeams, 3);
  assert.equal(eight.beforeMinTeams, 3);
  assert.equal(eight.afterMinTeams, 4);
  assert.equal(eight.minTeamDelta, 1);
  assert.equal(eight.maxTeamDelta, 1);
  assert.match(formatWindowShift(seven), new RegExp(`Left this division: ${leaving}`));
  assert.match(formatWindowShift(eight), new RegExp(`Entered this division: ${entering}`));
  assert.match(impact.summary, /moves 7 players from 7U Minors to 8U Minors \(−1 team \/ \+1 team\)/);
  assert.equal(
    impact.divisions.some((division) => division.code === "9U KP"),
    false,
  );
}

describe("cutoff impact diff", () => {
  it("stays a pure client helper", () => {
    const source = readFileSync(new URL("../cutoffImpact.ts", import.meta.url), "utf8");
    assert.match(source, /compareConfigs/);
    assert.equal(source.includes("prisma"), false);
    assert.equal(source.includes("server-only"), false);
    assert.equal(source.includes("fallball"), false);
    assert.equal(source.includes("PAPERCLIP_DEBUG_TOKEN"), false);
    assert.equal(source.includes("paperclip-debug"), false);
  });

  it("moves the May 1 birthdays from 7U Minors to 8U Minors when the cutoff crosses Apr 30", () => {
    const baseline = minors({ cutoffMonth: 4, cutoffDay: 30 });
    const proposed = minors({ cutoffMonth: 5, cutoffDay: 1 });
    const impact = buildCutoffImpact({
      buckets: boundaryBuckets("2019-05-01"),
      baseline,
      proposed,
      targetSeasonYear: SEASON,
    });
    assertSevenEightShift(impact, "May 1, 2019", "May 1, 2019");
    assert.match(impact.summary, /^Moving the 8U Minors cutoff to May 1 /);
    assert.match(formatWindowShift(byCode(impact.divisions, "7U MINOR")), /Was May 1, 2019–Apr 30, 2020/);
    assert.match(formatWindowShift(byCode(impact.divisions, "7U MINOR")), /Now May 2, 2019–May 1, 2020/);
  });

  it("moves the Sep 1 birthdays from 7U Minors to 8U Minors when the cutoff crosses Aug 31", () => {
    const baseline = minors({ cutoffMonth: 8, cutoffDay: 31 });
    const proposed = minors({ cutoffMonth: 9, cutoffDay: 1 });
    const impact = buildCutoffImpact({
      buckets: boundaryBuckets("2019-09-01"),
      baseline,
      proposed,
      targetSeasonYear: SEASON,
    });
    assertSevenEightShift(impact, "Sep 1, 2019", "Sep 1, 2019");
    assert.match(impact.summary, /^Moving the 8U Minors cutoff to Sep 1 /);
    assert.match(formatWindowShift(byCode(impact.divisions, "8U MINOR")), /Entered this division: Sep 1, 2019/);
  });

  it("uses the roster bounds for team changes instead of a fixed team size", () => {
    const roster: RosterSize = { min: 11, max: 11 };
    const impact = buildCutoffImpact({
      buckets: boundaryBuckets("2019-05-01"),
      baseline: minors({ cutoffMonth: 4, cutoffDay: 30 }),
      proposed: minors({ cutoffMonth: 5, cutoffDay: 1 }),
      targetSeasonYear: SEASON,
      options: { rosterFor: () => roster },
    });
    const seven = byCode(impact.divisions, "7U MINOR");
    const eight = byCode(impact.divisions, "8U MINOR");
    assert.equal(seven.playerDelta, -7);
    assert.equal(eight.playerDelta, 7);
    assert.equal(seven.minTeamDelta, 0);
    assert.equal(seven.maxTeamDelta, 0);
    assert.equal(eight.minTeamDelta, 0);
    assert.equal(teamCountRange(42, roster).minTeams, seven.beforeMinTeams);
    assert.equal(teamCountRange(35, roster).minTeams, seven.afterMinTeams);
    assert.match(impact.summary, /\(teams unchanged\)/);
  });

  it("describes a birthday-window edit that moves the same 7 players", () => {
    const baseline = minors({ cutoffMonth: 4, cutoffDay: 30 });
    const proposed = minors({ cutoffMonth: 4, cutoffDay: 30 });
    proposed.divisions = proposed.divisions.map((division) => {
      if (division.code === "7U MINOR") return { ...division, oldestBirthdate: "2019-05-02" };
      if (division.code === "8U MINOR") return { ...division, youngestBirthdate: "2019-05-01" };
      return division;
    });
    const impact = buildCutoffImpact({
      buckets: boundaryBuckets("2019-05-01"),
      baseline,
      proposed,
      targetSeasonYear: SEASON,
    });
    assertSevenEightShift(impact, "May 1, 2019", "May 1, 2019");
    assert.equal(
      impact.summary,
      "Moving the 8U Minors youngest birthdate to May 1, 2019 moves 7 players from 7U Minors to 8U Minors (−1 team / +1 team).",
    );
  });

  it("says nothing moves when the proposed table matches the start", () => {
    const config = minors({ cutoffMonth: 4, cutoffDay: 30 });
    const impact = buildCutoffImpact({
      buckets: boundaryBuckets("2019-05-01"),
      baseline: config,
      proposed: config,
      targetSeasonYear: SEASON,
    });
    assert.equal(impact.changed, false);
    assert.deepEqual(impact.divisions, []);
    assert.equal(impact.summary, "These dates match the starting table. No division changes players or teams.");
  });
});

describe("cutoff impact chart", () => {
  it("renders the 7U and 8U change, hides 9U, and offers reset", () => {
    const baseline = minors({ cutoffMonth: 4, cutoffDay: 30 });
    const proposed = minors({ cutoffMonth: 5, cutoffDay: 1 });
    const html = renderToStaticMarkup(
      createElement(DivisionAgesCutoffImpact, {
        baseline,
        proposed,
        counted: proposed,
        targetSeason: SEASON,
        counts: {
          rows: [
            row("7U MINOR", "7U Minors", 1, 42, 35, 4, 3),
            row("8U MINOR", "8U Minors", 2, 36, 43, 3, 4),
            row("9U KP", "9U Kid Pitch", 3, 20, 20, 2, 2),
          ],
          flows: [{ from: "7U MINOR", to: "8U MINOR", own: 7, feeder: 0, total: 7 }],
        },
        pending: false,
        stale: false,
        onReset: () => {},
      }),
    );
    assert.match(html, /data-testid="cutoff-impact"/);
    assert.match(html, /What this change does/);
    assert.match(html, /Moving the 8U Minors cutoff to May 1 moves 7 players from 7U Minors to 8U Minors/);
    assert.match(html, /42 → 35 \(−7\)/);
    assert.match(html, /36 → 43 \(\+7\)/);
    assert.match(html, /Teams 4 → 3 \(−1 team\)/);
    assert.match(html, /Teams 3 → 4 \(\+1 team\)/);
    assert.match(html, /Left this division: May 1, 2019/);
    assert.match(html, /data-testid="cutoff-impact-reset"/);
    assert.match(html, /Reset to starting table/);
    const chart = html.slice(html.indexOf('data-testid="cutoff-impact"'));
    assert.equal(chart.includes("9U Kid Pitch"), false);
    assert.doesNotMatch(html, /fullName|guardianEmail|@example\.com/);
  });

  it("hides the chart until a baseline exists and shows the idle summary when nothing changed", () => {
    const config = minors({ cutoffMonth: 4, cutoffDay: 30 });
    const hidden = renderToStaticMarkup(
      createElement(DivisionAgesCutoffImpact, {
        baseline: null,
        proposed: config,
        counted: config,
        targetSeason: SEASON,
        counts: { rows: [], flows: [] },
        pending: false,
        stale: false,
        onReset: () => {},
      }),
    );
    assert.equal(hidden, "");

    const idle = renderToStaticMarkup(
      createElement(DivisionAgesCutoffImpact, {
        baseline: config,
        proposed: config,
        counted: config,
        targetSeason: SEASON,
        counts: {
          rows: [row("7U MINOR", "7U Minors", 1, 42, 42, 4, 4)],
          flows: [],
        },
        pending: false,
        stale: false,
        onReset: () => {},
      }),
    );
    assert.match(idle, /These dates match the starting table/);
    assert.equal(idle.includes('data-testid="cutoff-impact-division"'), false);
    assert.equal(idle.includes("cutoff-impact-reset"), false);
  });
});

function row(
  code: string,
  label: string,
  sortOrder: number,
  before: number,
  after: number,
  beforeTeams: number,
  afterTeams: number,
) {
  return {
    code,
    label,
    sortOrder,
    inCurrent: true,
    inProposed: true,
    current: { own: before, feeder: 0, pool: before, expected: before, minTeams: beforeTeams, maxTeams: beforeTeams },
    proposed: { own: after, feeder: 0, pool: after, expected: after, minTeams: afterTeams, maxTeams: afterTeams },
    delta: {
      own: after - before,
      feeder: 0,
      pool: after - before,
      expected: after - before,
      minTeams: afterTeams - beforeTeams,
      maxTeams: afterTeams - beforeTeams,
    },
    movers: Math.abs(after - before),
    moversIn: { own: Math.max(0, after - before), feeder: 0, total: Math.max(0, after - before) },
    moversOut: { own: Math.max(0, before - after), feeder: 0, total: Math.max(0, before - after) },
    currentShortRoster: false,
    proposedShortRoster: false,
    currentOverlap: 0,
    proposedOverlap: 0,
    currentSharedPoolId: null,
    proposedSharedPoolId: null,
  };
}
