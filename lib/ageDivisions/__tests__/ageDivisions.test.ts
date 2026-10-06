import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { STANDARD_DIVISIONS } from "@/lib/sportsConnect/fallballDivisions";

import {
  calculatedRange,
  coverageWarnings,
  effectiveCutoffDate,
  effectiveRange,
  eligibleDivisions,
  exactAge,
  isSplitWindow,
  leagueAge,
  leagueDivisionDefaults,
  type CoverageWarning,
  type DivisionAgeConfig,
  type LeagueDivisionConfig,
} from "../index";

const SEASON = 2027;

function configFor(org: "gonzales" | "ascension" | "fallball"): LeagueDivisionConfig {
  return leagueDivisionDefaults(org);
}

function byCode(config: LeagueDivisionConfig, code: string): DivisionAgeConfig {
  const found = config.divisions.find((division) => division.code === code);
  assert.ok(found, `missing division ${code}`);
  return found;
}

function codesOf(divisions: DivisionAgeConfig[]): string[] {
  return divisions.map((division) => division.code);
}

function withYoungest(config: LeagueDivisionConfig, code: string, youngestBirthdate: string): LeagueDivisionConfig {
  return {
    rule: { ...config.rule },
    divisions: config.divisions.map((division) =>
      division.code === code ? { ...division, youngestBirthdate } : division,
    ),
  };
}

function warningsOf(warnings: CoverageWarning[], kind: CoverageWarning["kind"]): CoverageWarning[] {
  return warnings.filter((warning) => warning.kind === kind);
}

describe("effective cutoff dates", () => {
  it("uses Apr 30 of the season year for Gonzales", () => {
    assert.equal(effectiveCutoffDate(configFor("gonzales").rule, 2027), "2027-04-30");
  });

  it("uses Aug 31 of the season year for Ascension", () => {
    assert.equal(effectiveCutoffDate(configFor("ascension").rule, 2027), "2027-08-31");
  });

  it("uses Apr 30 of the following year for Fall Ball", () => {
    const rule = configFor("fallball").rule;
    assert.equal(rule.yearOffset, 1);
    assert.equal(effectiveCutoffDate(rule, 2026), "2027-04-30");
    assert.equal(effectiveCutoffDate(rule, 2027), "2028-04-30");
  });

  it("clamps 29 Feb to the last day of February in a non-leap year", () => {
    const rule = { cutoffMonth: 2, cutoffDay: 29, yearOffset: 0 };
    assert.equal(effectiveCutoffDate(rule, 2027), "2027-02-28");
    assert.equal(effectiveCutoffDate(rule, 2028), "2028-02-29");
  });
});

describe("Gonzales calculated ranges, season 2027", () => {
  const config = configFor("gonzales");
  const cutoff = effectiveCutoffDate(config.rule, SEASON);

  const expected: Array<[string, string, string]> = [
    ["3-4U TB", "2022-05-01", "2024-04-30"],
    ["5U TB", "2021-05-01", "2022-04-30"],
    ["6U MINOR", "2020-05-01", "2021-04-30"],
    ["6U MAJOR", "2020-05-01", "2021-04-30"],
    ["7U MINOR", "2019-05-01", "2020-04-30"],
    ["8U MINOR", "2018-05-01", "2019-04-30"],
    ["9U KP", "2017-05-01", "2018-04-30"],
    ["10U KP", "2016-05-01", "2017-04-30"],
    ["11-12U", "2014-05-01", "2016-04-30"],
    ["13-14U", "2012-05-01", "2014-04-30"],
    ["15-17U", "2009-05-01", "2012-04-30"],
  ];

  for (const [code, oldest, youngest] of expected) {
    it(`${code} is ${oldest} – ${youngest}`, () => {
      assert.deepEqual(calculatedRange(byCode(config, code), cutoff), { oldest, youngest });
      const effective = effectiveRange(byCode(config, code), cutoff);
      assert.equal(effective.oldestOverridden, false);
      assert.equal(effective.youngestOverridden, false);
      assert.equal(effective.oldest, oldest);
      assert.equal(effective.youngest, youngest);
    });
  }
});

describe("Ascension calculated ranges, season 2027", () => {
  const config = configFor("ascension");
  const cutoff = effectiveCutoffDate(config.rule, SEASON);

  const expected: Array<[string, string, string]> = [
    ["3-4U TB", "2022-09-01", "2024-08-31"],
    ["5U TB", "2021-09-01", "2022-08-31"],
    ["6U MOD", "2020-09-01", "2021-08-31"],
    ["6U CP", "2020-09-01", "2021-08-31"],
    ["7U MINOR", "2019-09-01", "2020-08-31"],
    ["8U MINOR", "2018-09-01", "2019-08-31"],
    ["7-8U MAJOR", "2018-09-01", "2020-08-31"],
    ["9-10U MAJOR", "2016-09-01", "2018-08-31"],
    ["11-12U MAJOR", "2014-09-01", "2016-08-31"],
  ];

  for (const [code, oldest, youngest] of expected) {
    it(`${code} is ${oldest} – ${youngest}`, () => {
      assert.deepEqual(calculatedRange(byCode(config, code), cutoff), { oldest, youngest });
    });
  }
});

describe("Fall Ball calculated ranges", () => {
  const config = configFor("fallball");

  it("copies codes from STANDARD_DIVISIONS", () => {
    assert.deepEqual(codesOf(config.divisions), [...STANDARD_DIVISIONS]);
  });

  it("Fall 2026 ages 15U and 17U as of 2027-04-30", () => {
    const cutoff = effectiveCutoffDate(config.rule, 2026);
    assert.equal(cutoff, "2027-04-30");
    assert.deepEqual(calculatedRange(byCode(config, "15U"), cutoff), {
      oldest: "2011-05-01",
      youngest: "2014-04-30",
    });
    assert.deepEqual(calculatedRange(byCode(config, "17U"), cutoff), {
      oldest: "2009-05-01",
      youngest: "2012-04-30",
    });
  });
});

describe("eligibility for birthdate 2019-07-17, season 2027", () => {
  const birthDate = "2019-07-17";

  it("Gonzales league age 7 yrs 9 mos, only 7U Minor", () => {
    const config = configFor("gonzales");
    const cutoff = effectiveCutoffDate(config.rule, SEASON);
    assert.equal(leagueAge(birthDate, cutoff), 7);
    assert.deepEqual(exactAge(birthDate, cutoff), { years: 7, months: 9 });
    assert.deepEqual(codesOf(eligibleDivisions(birthDate, config, SEASON)), ["7U MINOR"]);
  });

  it("Ascension league age 8 yrs 1 mo, 8 Minor and 7-8 Major", () => {
    const config = configFor("ascension");
    const cutoff = effectiveCutoffDate(config.rule, SEASON);
    assert.equal(leagueAge(birthDate, cutoff), 8);
    assert.deepEqual(exactAge(birthDate, cutoff), { years: 8, months: 1 });
    assert.deepEqual(codesOf(eligibleDivisions(birthDate, config, SEASON)).sort(), ["7-8U MAJOR", "8U MINOR"]);
  });

  it("is a split window between Gonzales and Ascension", () => {
    const gonzales = configFor("gonzales").rule;
    const ascension = configFor("ascension").rule;
    assert.equal(isSplitWindow(birthDate, gonzales, ascension, SEASON), true);
    assert.equal(isSplitWindow(birthDate, gonzales, gonzales, SEASON), false);
  });
});

describe("age boundaries", () => {
  it("2021-04-30 is Gonzales age 6 and 2021-05-01 is age 5", () => {
    const config = configFor("gonzales");
    const cutoff = effectiveCutoffDate(config.rule, SEASON);
    assert.equal(leagueAge("2021-04-30", cutoff), 6);
    assert.deepEqual(codesOf(eligibleDivisions("2021-04-30", config, SEASON)), ["6U MINOR", "6U MAJOR"]);
    assert.equal(leagueAge("2021-05-01", cutoff), 5);
    assert.deepEqual(codesOf(eligibleDivisions("2021-05-01", config, SEASON)), ["5U TB"]);
  });

  it("2020-08-31 is Ascension age 7 and 2020-09-01 is age 6", () => {
    const config = configFor("ascension");
    const cutoff = effectiveCutoffDate(config.rule, SEASON);
    assert.equal(leagueAge("2020-08-31", cutoff), 7);
    assert.deepEqual(codesOf(eligibleDivisions("2020-08-31", config, SEASON)).sort(), ["7-8U MAJOR", "7U MINOR"]);
    assert.equal(leagueAge("2020-09-01", cutoff), 6);
    assert.deepEqual(codesOf(eligibleDivisions("2020-09-01", config, SEASON)), ["6U MOD", "6U CP"]);
  });

  it("2020-02-29 is Gonzales age 7", () => {
    const config = configFor("gonzales");
    const cutoff = effectiveCutoffDate(config.rule, SEASON);
    assert.equal(leagueAge("2020-02-29", cutoff), 7);
    assert.deepEqual(codesOf(eligibleDivisions("2020-02-29", config, SEASON)), ["7U MINOR"]);
  });

  it("2024-05-01 is Gonzales age 2 and in no division", () => {
    const config = configFor("gonzales");
    const cutoff = effectiveCutoffDate(config.rule, SEASON);
    assert.equal(leagueAge("2024-05-01", cutoff), 2);
    assert.deepEqual(eligibleDivisions("2024-05-01", config, SEASON), []);
  });

  it("2009-04-30 is Gonzales age 18 with no division; 2009-05-01 is age 17 in 15/17U", () => {
    const config = configFor("gonzales");
    const cutoff = effectiveCutoffDate(config.rule, SEASON);
    assert.equal(leagueAge("2009-04-30", cutoff), 18);
    assert.deepEqual(eligibleDivisions("2009-04-30", config, SEASON), []);
    assert.equal(leagueAge("2009-05-01", cutoff), 17);
    assert.deepEqual(codesOf(eligibleDivisions("2009-05-01", config, SEASON)), ["15-17U"]);
  });

  it("reads a UTC-midnight Date the same as a YYYY-MM-DD string", () => {
    const cutoff = effectiveCutoffDate(configFor("gonzales").rule, SEASON);
    assert.equal(leagueAge(new Date("2019-07-17T00:00:00.000Z"), cutoff), 7);
  });
});

describe("coverage on default configs", () => {
  it("Gonzales 2027 has no gaps and one 6U Minor/Major overlap", () => {
    const config = configFor("gonzales");
    const cutoff = effectiveCutoffDate(config.rule, SEASON);
    const ranges = config.divisions.map((division) => calculatedRange(division, cutoff));
    assert.equal([...ranges.map((range) => range.oldest)].sort()[0], "2009-05-01");
    assert.equal([...ranges.map((range) => range.youngest)].sort().at(-1), "2024-04-30");

    const warnings = coverageWarnings(config.divisions, cutoff);
    assert.deepEqual(warningsOf(warnings, "gap"), []);
    assert.deepEqual(warningsOf(warnings, "invalid"), []);
    assert.deepEqual(warningsOf(warnings, "overlap"), [
      {
        kind: "overlap",
        from: "2020-05-01",
        to: "2021-04-30",
        divisionCodes: ["6U MINOR", "6U MAJOR"],
      },
    ]);
  });

  it("Fall Ball 2026 overlaps 15U and 17U for 2011-05-01 – 2012-04-30", () => {
    const config = configFor("fallball");
    const cutoff = effectiveCutoffDate(config.rule, 2026);
    const warnings = coverageWarnings(config.divisions, cutoff);
    assert.deepEqual(warningsOf(warnings, "gap"), []);
    assert.deepEqual(warningsOf(warnings, "overlap"), [
      {
        kind: "overlap",
        from: "2011-05-01",
        to: "2012-04-30",
        divisionCodes: ["15U", "17U"],
      },
    ]);
  });

  it("Ascension 2027 has three overlaps and no gaps", () => {
    const config = configFor("ascension");
    const cutoff = effectiveCutoffDate(config.rule, SEASON);
    const warnings = coverageWarnings(config.divisions, cutoff);
    assert.deepEqual(warningsOf(warnings, "gap"), []);
    assert.deepEqual(warningsOf(warnings, "invalid"), []);
    assert.deepEqual(warningsOf(warnings, "overlap"), [
      {
        kind: "overlap",
        from: "2018-09-01",
        to: "2019-08-31",
        divisionCodes: ["8U MINOR", "7-8U MAJOR"],
      },
      {
        kind: "overlap",
        from: "2019-09-01",
        to: "2020-08-31",
        divisionCodes: ["7U MINOR", "7-8U MAJOR"],
      },
      {
        kind: "overlap",
        from: "2020-09-01",
        to: "2021-08-31",
        divisionCodes: ["6U MOD", "6U CP"],
      },
    ]);
  });
});

describe("birthdate overrides", () => {
  it("extends Gonzales 6U Minor through 2021-08-31 and overlaps 5U Tee Ball", () => {
    const config = withYoungest(configFor("gonzales"), "6U MINOR", "2021-08-31");
    const cutoff = effectiveCutoffDate(config.rule, SEASON);
    const range = effectiveRange(byCode(config, "6U MINOR"), cutoff);
    assert.deepEqual(range, {
      oldest: "2020-05-01",
      youngest: "2021-08-31",
      oldestOverridden: false,
      youngestOverridden: true,
    });

    const warnings = coverageWarnings(config.divisions, cutoff);
    const fiveAndSix = warningsOf(warnings, "overlap").find((warning) =>
      warning.divisionCodes.includes("5U TB") && warning.divisionCodes.includes("6U MINOR"),
    );
    assert.deepEqual(fiveAndSix, {
      kind: "overlap",
      from: "2021-05-01",
      to: "2021-08-31",
      divisionCodes: ["5U TB", "6U MINOR"],
    });
    assert.deepEqual(codesOf(eligibleDivisions("2021-07-01", config, SEASON)), ["5U TB", "6U MINOR"]);
  });

  it("shrinking Gonzales 7U Minor to 2020-03-31 opens a gap and does not throw", () => {
    const config = withYoungest(configFor("gonzales"), "7U MINOR", "2020-03-31");
    const cutoff = effectiveCutoffDate(config.rule, SEASON);
    const warnings = coverageWarnings(config.divisions, cutoff);
    assert.deepEqual(warningsOf(warnings, "gap"), [
      {
        kind: "gap",
        from: "2020-04-01",
        to: "2020-04-30",
        divisionCodes: ["6U MINOR", "6U MAJOR", "7U MINOR"],
      },
    ]);
  });
});

describe("odd input never throws", () => {
  it("reports min > max and an inverted override as invalid warnings", () => {
    const cutoff = "2027-04-30";
    const divisions: DivisionAgeConfig[] = [
      {
        code: "BACKWARDS",
        label: "Backwards",
        minAge: 8,
        maxAge: 6,
        sortOrder: 1,
      },
      {
        code: "FLIPPED",
        label: "Flipped",
        minAge: 7,
        maxAge: 7,
        oldestBirthdate: "2020-06-01",
        youngestBirthdate: "2020-01-01",
        sortOrder: 2,
      },
    ];

    let warnings: CoverageWarning[] = [];
    assert.doesNotThrow(() => {
      warnings = coverageWarnings(divisions, cutoff);
    });
    assert.deepEqual(warningsOf(warnings, "invalid").map((warning) => warning.divisionCodes[0]), [
      "BACKWARDS",
      "FLIPPED",
    ]);
    assert.deepEqual(warningsOf(warnings, "gap"), []);
    assert.deepEqual(warningsOf(warnings, "overlap"), []);
  });

  it("returns no divisions for an unparseable birthdate", () => {
    const config = configFor("gonzales");
    assert.doesNotThrow(() => {
      assert.deepEqual(eligibleDivisions("not-a-date", config, SEASON), []);
      assert.equal(isSplitWindow("not-a-date", config.rule, configFor("ascension").rule, SEASON), false);
      assert.equal(Number.isNaN(leagueAge("not-a-date", "2027-04-30")), true);
    });
  });

  it("returns a fresh config so callers cannot mutate the built-in defaults", () => {
    const first = configFor("gonzales");
    first.divisions[0]!.minAge = 99;
    first.rule.cutoffDay = 1;
    const second = configFor("gonzales");
    assert.equal(second.divisions[0]!.minAge, 3);
    assert.equal(second.rule.cutoffDay, 30);
  });

  it("clamps a 29 Feb cutoff when subtracting years into a non-leap year", () => {
    const range = calculatedRange({ minAge: 1, maxAge: 1 }, "2024-02-29");
    assert.deepEqual(range, { oldest: "2022-03-01", youngest: "2023-02-28" });
  });
});
