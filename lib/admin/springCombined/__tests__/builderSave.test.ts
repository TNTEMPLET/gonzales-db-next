import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { trentBuilderTable } from "@/lib/ageDivisions/__tests__/trentBuilderTable";
import { leagueDivisionDefaults } from "@/lib/ageDivisions/defaults";
import type { DivisionAgeConfig } from "@/lib/ageDivisions/types";

import { proposedFromBuilder } from "../builderSave";
import { combinedSavePreview, type CombinedSaveLeaguePreview, type SpringLeagueTable } from "../save";
import { asSpringScratchTable } from "../view";

const SEASON = 2027;

function division(
  code: string,
  label: string,
  minAge: number,
  maxAge: number,
  sortOrder: number,
): DivisionAgeConfig {
  return { code, label, minAge, maxAge, sortOrder };
}

/** Saved 2027 rows from the Divisions tab: Gonzales defaults, Ascension without 7U Minor. */
function image2Leagues(): SpringLeagueTable[] {
  const gonzales = leagueDivisionDefaults("gonzales");
  const ascension = leagueDivisionDefaults("ascension");
  return [
    { organizationId: "gonzales", cutoff: gonzales.rule, divisions: gonzales.divisions },
    {
      organizationId: "ascension",
      cutoff: ascension.rule,
      divisions: [
        division("3-4U TB", "Tee Ball 3-4", 3, 4, 1),
        division("5U TB", "Tee Ball 5", 5, 5, 2),
        division("6U MOD", "Modified Tee Ball/CP", 6, 6, 3),
        division("6U CP", "Coach Pitch", 6, 6, 4),
        division("8U MINOR", "Coach Pitch 8 Minor", 8, 8, 5),
        division("7-8U MAJOR", "Coach Pitch 7-8 Major", 7, 8, 6),
        division("9-10U MAJOR", "10 Major", 9, 10, 7),
        division("11-12U MAJOR", "12 Major", 11, 12, 8),
      ],
    },
  ];
}

function labels(
  leagues: readonly CombinedSaveLeaguePreview[],
  org: "gonzales" | "ascension",
  kind: "changed" | "added" | "removed",
) {
  const league = leagues.find((item) => item.organizationId === org);
  return league?.changes.filter((change) => change.kind === kind).map((change) => change.label) ?? [];
}

describe("builder table to combined save", () => {
  it("keeps a same-window Minors/Majors pair and replaces the rows the builder dropped", () => {
    const current = image2Leagues();
    const built = proposedFromBuilder(trentBuilderTable(), current);
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const savedCodes = built.proposed.divisions.map((division) => division.code);
    assert.deepEqual(
      savedCodes.filter((code) => code.startsWith("gonzales:")),
      ["gonzales:6U MINOR", "gonzales:6U MAJOR", "gonzales:10U", "gonzales:11-12U", "gonzales:13-14U", "gonzales:15-17U"],
    );
    assert.deepEqual(
      savedCodes.filter((code) => code.startsWith("ascension:")),
      [
        "ascension:3-4U TB",
        "ascension:5U TB",
        "ascension:8U Minors",
        "ascension:7-8U MAJOR",
        "ascension:9-10U MAJOR",
        "ascension:11-12U MAJOR",
      ],
    );
    assert.equal(savedCodes.some((code) => code.startsWith("fallball:")), false);

    const preview = combinedSavePreview(current, built.proposed, SEASON);
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.deepEqual(labels(preview.preview.leagues, "gonzales", "removed"), [
      "3-4U Tee Ball",
      "5U Tee Ball",
      "7U Minor Coach Pitch",
      "8U Minor Coach Pitch",
      "9U Kid Pitch",
      "10U Kid Pitch",
    ]);
    assert.deepEqual(labels(preview.preview.leagues, "gonzales", "added"), ["10U"]);
    assert.deepEqual(labels(preview.preview.leagues, "gonzales", "changed"), [
      "6U Minors CP",
      "6U Majors CP",
      "12U",
      "15-17U",
    ]);
    assert.deepEqual(labels(preview.preview.leagues, "ascension", "removed"), [
      "Modified Tee Ball/CP",
      "Coach Pitch",
      "Coach Pitch 8 Minor",
    ]);
    assert.deepEqual(labels(preview.preview.leagues, "ascension", "added"), ["8U Minors"]);
    assert.deepEqual(labels(preview.preview.leagues, "ascension", "changed"), [
      "3-4 Tee Ball",
      "5U Mod CP",
      "8U Majors",
      "10U",
      "12U",
    ]);

    const ascension = preview.preview.leagues.find((league) => league.organizationId === "ascension")!;
    const tee = ascension.changes.find((change) => change.label === "3-4 Tee Ball");
    assert.equal(tee?.kind, "changed");
    assert.match(tee?.before ?? "", /Sep 1, 2022/);
    assert.match(tee?.after ?? "", /May 1, 2022/);
    const majors = ascension.changes.find((change) => change.label === "8U Majors");
    assert.match(majors?.before ?? "", /Aug 31, 2020/);
    assert.match(majors?.after ?? "", /Apr 30, 2020/);
  });

  it("lists more than a one-row move when Trent's 12 divisions replace the built-in 20", () => {
    const current: SpringLeagueTable[] = (["gonzales", "ascension"] as const).map((organizationId) => {
      const defaults = leagueDivisionDefaults(organizationId);
      return { organizationId, cutoff: defaults.rule, divisions: defaults.divisions };
    });
    assert.equal(
      current.reduce((sum, league) => sum + league.divisions.length, 0),
      20,
    );
    const built = proposedFromBuilder(trentBuilderTable(), current);
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.proposed.divisions.length, 12);
    const preview = combinedSavePreview(current, built.proposed, SEASON);
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    const changes = preview.preview.leagues.flatMap((league) => league.changes);
    assert.ok(changes.length > 2);
    assert.ok(changes.some((change) => change.kind === "removed"));
    assert.ok(changes.some((change) => change.kind === "added" || change.kind === "changed"));
  });

  it("loads a single-league file into the spring scratch table", () => {
    const table = trentBuilderTable();
    table.organizationId = "gonzales";
    const adopted = asSpringScratchTable(table);
    assert.equal(adopted.organizationId, "spring");
    assert.equal(adopted.seasonYear, SEASON);
    assert.equal(adopted.rows.length, 12);
    assert.equal(adopted.rows[1]?.name, "5U Mod CP LLB");
    assert.equal(table.organizationId, "gonzales");
    assert.notEqual(adopted.rows[0], table.rows[0]);
  });

  it("refuses an Other row and does not invent a Fall Ball league", () => {
    const current = image2Leagues();
    const table = trentBuilderTable();
    table.rows[0] = { ...table.rows[0]!, charter: "other" };
    const built = proposedFromBuilder(table, current);
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.match(built.error, /Other/);
    assert.doesNotMatch(built.error, /fallball/i);
  });
});
