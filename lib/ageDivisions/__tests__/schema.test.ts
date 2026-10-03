import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculatedRange, coverageWarnings, effectiveRange } from "../compute";
import { leagueDivisionDefaults as defaults } from "../defaults";
import { clearDivisionBirthdates, setDivisionBirthdate } from "../draft";
import { validateLeagueDefaults, validateSeasonWrite } from "../schema";

const CUTOFF = { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 };
const SEASON = 2027;

function division(overrides: Record<string, unknown> = {}) {
  return {
    code: "7U",
    label: "7U",
    minAge: 7,
    maxAge: 7,
    sortOrder: 1,
    ...overrides,
  };
}

describe("division age validation", () => {
  it("accepts the built-in leagues, including overlaps", () => {
    for (const org of ["gonzales", "ascension", "fallball"] as const) {
      const config = defaults(org);
      const parsed = validateLeagueDefaults({
        cutoffMonth: config.rule.cutoffMonth,
        cutoffDay: config.rule.cutoffDay,
        yearOffset: config.rule.yearOffset,
        divisions: config.divisions,
      });
      assert.equal(parsed.ok, true, org);
    }
    const warnings = coverageWarnings(defaults("gonzales").divisions, "2027-04-30");
    assert.ok(warnings.some((warning) => warning.kind === "overlap"));
    const gonzales = defaults("gonzales");
    const season = validateSeasonWrite(
      { cutoff: gonzales.rule, divisions: gonzales.divisions },
      SEASON,
    );
    assert.equal(season.ok, true);
  });

  it("rejects impossible cutoff days, offsets, ages, dates, and duplicate codes", () => {
    const month = validateLeagueDefaults({ cutoffMonth: 13, cutoffDay: 1, yearOffset: 0, divisions: [] });
    assert.equal(month.ok, false);

    const april = validateLeagueDefaults({ cutoffMonth: 4, cutoffDay: 31, yearOffset: 0, divisions: [] });
    assert.equal(april.ok, false);
    if (!april.ok) assert.match(april.error, /Day must be between 1 and 30/);

    const offset = validateLeagueDefaults({ cutoffMonth: 4, cutoffDay: 30, yearOffset: 3, divisions: [] });
    assert.equal(offset.ok, false);

    const age = validateSeasonWrite({ cutoff: CUTOFF, divisions: [division({ minAge: -1 })] }, SEASON);
    assert.equal(age.ok, false);

    const span = validateSeasonWrite({ cutoff: CUTOFF, divisions: [division({ minAge: 9, maxAge: 8 })] }, SEASON);
    assert.equal(span.ok, false);
    if (!span.ok) assert.match(span.error, /Minimum age must be less than or equal to maximum age/);

    const date = validateSeasonWrite(
      { cutoff: CUTOFF, divisions: [division({ oldestBirthdate: "2027-02-31" })] },
      SEASON,
    );
    assert.equal(date.ok, false);

    const duplicate = validateSeasonWrite(
      {
        cutoff: CUTOFF,
        divisions: [division(), division({ code: "7U", label: "Other", sortOrder: 2 })],
      },
      SEASON,
    );
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.match(duplicate.error, /unique/);

    const tooMany = validateLeagueDefaults({
      cutoffMonth: 4,
      cutoffDay: 30,
      yearOffset: 0,
      divisions: Array.from({ length: 41 }, (_, index) => division({ code: `D${index}`, sortOrder: index + 1 })),
    });
    assert.equal(tooMany.ok, false);
  });

  it("rejects an oldest birthdate after the youngest without treating overlaps as errors", () => {
    const backwards = validateSeasonWrite(
      { cutoff: CUTOFF, divisions: [division({ oldestBirthdate: "2021-01-01" })] },
      SEASON,
    );
    assert.equal(backwards.ok, false);
    if (!backwards.ok) assert.match(backwards.error, /Oldest birthdate must be on or before the youngest birthdate/);

    const overlap = validateSeasonWrite(
      {
        cutoff: CUTOFF,
        divisions: [
          division({ code: "6U A", label: "6U A", minAge: 6, maxAge: 6, sortOrder: 1 }),
          division({ code: "6U B", label: "6U B", minAge: 6, maxAge: 6, sortOrder: 2 }),
        ],
      },
      SEASON,
    );
    assert.equal(overlap.ok, true);
  });
});

describe("division age overrides", () => {
  it("keeps an override, drops it on reset, and still reports coverage warnings", () => {
    const base = division();
    const cutoffIso = "2027-04-30";
    const calculated = calculatedRange(base, cutoffIso);
    const edited = setDivisionBirthdate(base, "oldestBirthdate", "2019-01-01", cutoffIso);
    assert.equal(edited.oldestBirthdate, "2019-01-01");
    assert.equal(effectiveRange(edited, cutoffIso).oldest, "2019-01-01");
    assert.equal(effectiveRange(edited, cutoffIso).oldestOverridden, true);

    const typedBack = setDivisionBirthdate(edited, "oldestBirthdate", calculated.oldest, cutoffIso);
    assert.equal(typedBack.oldestBirthdate, undefined);
    assert.equal(effectiveRange(typedBack, cutoffIso).oldest, calculated.oldest);
    assert.equal(effectiveRange(typedBack, cutoffIso).oldestOverridden, false);

    const cleared = clearDivisionBirthdates(edited);
    assert.equal(cleared.oldestBirthdate, undefined);
    assert.equal(cleared.youngestBirthdate, undefined);

    const warnings = coverageWarnings([edited, division({ code: "7U B", label: "7U B", sortOrder: 2 })], cutoffIso);
    assert.ok(warnings.length > 0);
    const saved = validateSeasonWrite({ cutoff: CUTOFF, divisions: [edited] }, SEASON);
    assert.equal(saved.ok, true);
  });
});
