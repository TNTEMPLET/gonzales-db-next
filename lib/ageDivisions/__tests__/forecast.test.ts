import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_ROSTER,
  FALLBACK_RETENTION,
  assignBuckets,
  carryoverRate,
  compareConfigs,
  projectDivision,
  teamCountRange,
  type BirthBucket,
  type DivisionAssignment,
  type ForecastConfig,
  type RosterSize,
} from "../index";

const SEASON = 2027;

function division(
  code: string,
  minAge: number,
  maxAge: number,
  sortOrder: number,
  overrides: { oldestBirthdate?: string; youngestBirthdate?: string } = {},
) {
  return {
    code,
    label: code,
    minAge,
    maxAge,
    sortOrder,
    ...overrides,
  };
}

function dyb(divisions: ForecastConfig["divisions"], yearOffset = 0): ForecastConfig {
  return {
    cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset },
    divisions,
  };
}

function ll(divisions: ForecastConfig["divisions"]): ForecastConfig {
  return {
    cutoff: { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 },
    divisions,
  };
}

function bucket(birthDate: string, count: number, pool: BirthBucket["pool"] = "own"): BirthBucket {
  return { birthDate, count, pool };
}

function byCode(assignment: { divisions: DivisionAssignment[] }, code: string): DivisionAssignment {
  const found = assignment.divisions.find((row) => row.code === code);
  assert.ok(found, `missing division ${code}`);
  return found;
}

function rosterFor(): RosterSize {
  return DEFAULT_ROSTER;
}

describe("forecast module stays client-safe", () => {
  const source = readFileSync(new URL("../forecast.ts", import.meta.url), "utf8");

  it("imports the age math and does not touch the server or the database", () => {
    assert.match(source, /from "\.\/compute"/);
    assert.equal(source.includes("server-only"), false);
    assert.equal(source.includes("prisma"), false);
    assert.equal(source.includes("@prisma"), false);
  });
});

describe("cutoff edges", () => {
  const ages = [division("5U", 5, 5, 1), division("6U", 6, 6, 2)];

  it("DYB Apr 30: a birthday on the cutoff day is a year older than the day after", () => {
    const assigned = assignBuckets(
      [bucket("2021-04-30", 2), bucket("2021-05-01", 3)],
      dyb(ages),
      SEASON,
    );
    assert.equal(byCode(assigned, "6U").own, 2);
    assert.equal(byCode(assigned, "5U").own, 3);
    assert.deepEqual(assigned.distinctTotal, { own: 5, feeder: 0, total: 5 });
  });

  it("LL Aug 31: a birthday on the cutoff day is a year older than the day after", () => {
    const assigned = assignBuckets(
      [bucket("2021-08-31", 4), bucket("2021-09-01", 5)],
      ll(ages),
      SEASON,
    );
    assert.equal(byCode(assigned, "6U").own, 4);
    assert.equal(byCode(assigned, "5U").own, 5);
  });

  it("counts a Feb 29 birthday under the Apr 30 cutoff", () => {
    const assigned = assignBuckets(
      [bucket("2020-02-29", 1)],
      dyb([division("7U", 7, 7, 1)]),
      SEASON,
    );
    assert.equal(byCode(assigned, "7U").total, 1);
    assert.equal(assigned.agedOut.total, 0);
    assert.equal(assigned.tooYoung.total, 0);
  });

  it("uses a Feb 29 cutoff clamped to Feb 28 in a non-leap season", () => {
    const config: ForecastConfig = {
      cutoff: { cutoffMonth: 2, cutoffDay: 29, yearOffset: 0 },
      divisions: [division("10U", 10, 10, 1), division("11U", 11, 11, 2)],
    };
    const assigned = assignBuckets(
      [bucket("2016-02-28", 6), bucket("2016-03-01", 7)],
      config,
      2027,
    );
    assert.equal(byCode(assigned, "11U").own, 6);
    assert.equal(byCode(assigned, "10U").own, 7);
  });

  it("Fall yearOffset +1 ages the target season as of the following April 30", () => {
    const fall = dyb(ages, 1);
    const spring = dyb(ages, 0);
    const buckets = [bucket("2021-04-30", 2)];
    const agedForward = assignBuckets(buckets, fall, 2026);
    const sameYear = assignBuckets(buckets, spring, 2026);
    assert.equal(byCode(agedForward, "6U").own, 2);
    assert.equal(byCode(agedForward, "5U").own, 0);
    assert.equal(byCode(sameYear, "5U").own, 2);
    assert.equal(byCode(sameYear, "6U").own, 0);
  });
});

describe("overlapping divisions", () => {
  // Apr 30 2027. 13–15 is 2011-05-01–2014-04-30. 15–17 is 2009-05-01–2012-04-30.
  const config = dyb([division("13-15", 13, 15, 1), division("15-17", 15, 17, 2)]);

  it("counts a player in every matching division and once in distinctTotal", () => {
    const assigned = assignBuckets(
      [
        bucket("2011-06-15", 4),
        bucket("2013-06-15", 2),
        bucket("2010-06-15", 3, "feeder"),
        bucket("2016-01-01", 7),
        bucket("2008-01-01", 5, "feeder"),
      ],
      config,
      SEASON,
    );
    const junior = byCode(assigned, "13-15");
    const senior = byCode(assigned, "15-17");
    assert.deepEqual(
      { own: junior.own, feeder: junior.feeder, total: junior.total, overlap: junior.overlap },
      { own: 6, feeder: 0, total: 6, overlap: 4 },
    );
    assert.deepEqual(
      { own: senior.own, feeder: senior.feeder, total: senior.total, overlap: senior.overlap },
      { own: 4, feeder: 3, total: 7, overlap: 4 },
    );
    assert.deepEqual(assigned.distinctTotal, { own: 6, feeder: 3, total: 9 });
    assert.deepEqual(assigned.tooYoung, { own: 7, feeder: 0, total: 7 });
    assert.deepEqual(assigned.agedOut, { own: 0, feeder: 5, total: 5 });
    assert.deepEqual(assigned.unmatched, { own: 0, feeder: 0, total: 0 });
  });

  it("reports a gap between windows as unmatched", () => {
    const gapped = dyb([division("8U", 8, 8, 1), division("10U", 10, 10, 2)]);
    const assigned = assignBuckets(
      [bucket("2017-06-01", 3), bucket("2019-05-01", 1), bucket("2016-04-30", 2, "feeder")],
      gapped,
      SEASON,
    );
    assert.deepEqual(assigned.unmatched, { own: 3, feeder: 0, total: 3 });
    assert.deepEqual(assigned.tooYoung, { own: 1, feeder: 0, total: 1 });
    assert.deepEqual(assigned.agedOut, { own: 0, feeder: 2, total: 2 });
    assert.equal(assigned.distinctTotal.total, 0);
  });

  it("counts movers when a later cutoff pulls a player into the overlap", () => {
    const buckets = [bucket("2012-06-01", 8), bucket("2013-01-01", 1)];
    const compared = compareConfigs(buckets, config, ll(config.divisions), SEASON, {
      retentionRate: 1,
      includeFeeder: false,
      rosterFor,
    });
    assert.equal(compared.movers, 8);
    const junior = compared.rows.find((row) => row.code === "13-15");
    const senior = compared.rows.find((row) => row.code === "15-17");
    assert.ok(junior && senior);
    assert.equal(junior.movers, 0);
    assert.equal(senior.movers, 8);
    assert.equal(junior.current.own, 9);
    assert.equal(senior.current.own, 0);
    assert.equal(junior.proposed.own, 9);
    assert.equal(senior.proposed.own, 8);
  });
});

describe("projectDivision", () => {
  it("drops the feeder pool when the toggle is off", () => {
    assert.deepEqual(
      projectDivision({ own: 10, feeder: 5 }, { retentionRate: 1, includeFeeder: false }),
      { pool: 10, expected: 10 },
    );
    assert.deepEqual(
      projectDivision({ own: 10, feeder: 5 }, { retentionRate: 1, includeFeeder: true }),
      { pool: 15, expected: 15 },
    );
  });

  it("rounds a fractional rate and keeps 0 and 1 exact", () => {
    assert.deepEqual(
      projectDivision({ own: 10, feeder: 7 }, { retentionRate: 0, includeFeeder: true }),
      { pool: 17, expected: 0 },
    );
    assert.deepEqual(
      projectDivision({ own: 10, feeder: 1 }, { retentionRate: 0.29, includeFeeder: false }),
      { pool: 10, expected: 3 },
    );
    assert.deepEqual(
      projectDivision({ own: 2, feeder: 0 }, { retentionRate: 0.44, includeFeeder: false }),
      { pool: 2, expected: 1 },
    );
    assert.equal(
      projectDivision({ own: 1, feeder: 0 }, { retentionRate: 0.5, includeFeeder: false }).expected,
      1,
    );
    assert.equal(
      projectDivision({ own: 1, feeder: 0 }, { retentionRate: 0.49, includeFeeder: false }).expected,
      0,
    );
    assert.deepEqual(
      projectDivision({ own: 10, feeder: 7 }, { retentionRate: 0.25, includeFeeder: true }),
      { pool: 17, expected: 4 },
    );
  });

  it("rejects a retention rate outside 0–1", () => {
    assert.throws(() => projectDivision({ own: 1, feeder: 0 }, { retentionRate: -0.01, includeFeeder: false }));
    assert.throws(() => projectDivision({ own: 1, feeder: 0 }, { retentionRate: 1.01, includeFeeder: false }));
    assert.throws(() => projectDivision({ own: 1, feeder: 0 }, { retentionRate: Number.NaN, includeFeeder: false }));
  });
});

describe("teamCountRange", () => {
  const cases: Array<[number, number, number, boolean]> = [
    [34, 3, 3, false],
    [92, 8, 8, false],
    [152, 13, 13, false],
    [60, 5, 5, false],
    [23, 2, 2, false],
    [5, 1, 1, true],
    [0, 0, 0, false],
  ];

  for (const [players, minTeams, maxTeams, shortRoster] of cases) {
    it(`${players} players → ${minTeams}–${maxTeams}${shortRoster ? " short" : ""}`, () => {
      const range = teamCountRange(players, DEFAULT_ROSTER);
      assert.equal(range.minTeams, minTeams);
      assert.equal(range.maxTeams, maxTeams);
      assert.equal(range.shortRoster, shortRoster);
      if (minTeams === 0) {
        assert.equal(range.avgAtMin, 0);
        assert.equal(range.avgAtMax, 0);
      } else {
        assert.equal(range.avgAtMin, players / minTeams);
        assert.equal(range.avgAtMax, players / maxTeams);
      }
    });
  }

  it("widens the range when min and max roster sizes leave room", () => {
    const range = teamCountRange(40, { min: 10, max: 15 });
    assert.equal(range.minTeams, 3);
    assert.equal(range.maxTeams, 4);
    assert.equal(range.avgAtMin, 40 / 3);
    assert.equal(range.avgAtMax, 10);
    assert.equal(range.shortRoster, false);
  });

  it("accepts the inclusive roster bounds", () => {
    assert.equal(teamCountRange(1, { min: 1, max: 1 }).shortRoster, false);
    assert.equal(teamCountRange(30, { min: 1, max: 30 }).minTeams, 1);
  });

  it("rejects roster sizes outside 1 ≤ min ≤ max ≤ 30", () => {
    const invalid: RosterSize[] = [
      { min: 0, max: 12 },
      { min: 12, max: 11 },
      { min: 1, max: 31 },
      { min: -1, max: 5 },
      { min: 1.5, max: 10 },
      { min: 11, max: 12.2 },
    ];
    for (const roster of invalid) {
      assert.throws(() => teamCountRange(10, roster), RangeError);
    }
    assert.throws(() => teamCountRange(-1, DEFAULT_ROSTER), RangeError);
  });
});

describe("compareConfigs", () => {
  it("keeps a division that exists on only one side", () => {
    const current = dyb([division("10U", 10, 10, 2)]);
    const proposed = dyb([division("10U", 10, 10, 5), division("14U", 14, 14, 1)]);
    const compared = compareConfigs(
      [bucket("2013-01-15", 9), bucket("2016-06-01", 4, "feeder")],
      current,
      proposed,
      SEASON,
      { retentionRate: 0.5, includeFeeder: true, rosterFor },
    );
    assert.deepEqual(
      compared.rows.map((row) => row.code),
      ["14U", "10U"],
    );
    const older = compared.rows[0]!;
    const younger = compared.rows[1]!;
    assert.equal(older.inCurrent, false);
    assert.equal(older.inProposed, true);
    assert.deepEqual(older.current, {
      own: 0,
      feeder: 0,
      pool: 0,
      expected: 0,
      minTeams: 0,
      maxTeams: 0,
    });
    assert.equal(older.proposed.own, 9);
    assert.equal(older.proposed.pool, 9);
    assert.equal(older.proposed.expected, 5);
    assert.equal(older.delta.own, 9);
    assert.equal(older.movers, 9);
    assert.equal(younger.inCurrent, true);
    assert.equal(younger.current.feeder, 4);
    assert.equal(younger.current.pool, 4);
    assert.equal(younger.current.expected, 2);
    assert.equal(younger.proposed.feeder, 4);
    assert.equal(compared.movers, 9);
    assert.equal(compared.current.distinctTotal.feeder, 4);
    assert.equal(compared.current.distinctTotal.own, 0);
    assert.equal(compared.proposed.distinctTotal.own, 9);
    assert.equal(compared.current.agedOut.own, 9);
  });

  it("applies feeder and retention on each side without dropping the raw feeder count", () => {
    const config = dyb([division("10U", 10, 10, 1)]);
    const buckets = [bucket("2016-06-01", 20), bucket("2016-06-01", 10, "feeder")];
    const withFeeder = compareConfigs(buckets, config, config, SEASON, {
      retentionRate: 0.5,
      includeFeeder: true,
      rosterFor,
    });
    const ownOnly = compareConfigs(buckets, config, config, SEASON, {
      retentionRate: 0.5,
      includeFeeder: false,
      rosterFor,
    });
    const included = withFeeder.rows[0]!;
    const excluded = ownOnly.rows[0]!;
    assert.equal(included.current.own, 20);
    assert.equal(included.current.feeder, 10);
    assert.equal(included.current.pool, 30);
    assert.equal(included.current.expected, 15);
    assert.equal(included.current.minTeams, 2);
    assert.equal(included.current.maxTeams, 2);
    assert.equal(excluded.current.feeder, 10);
    assert.equal(excluded.current.pool, 20);
    assert.equal(excluded.current.expected, 10);
    assert.equal(excluded.current.minTeams, 1);
    assert.equal(excluded.current.maxTeams, 1);
    assert.equal(withFeeder.movers, 0);
  });
});

describe("per-division date overrides", () => {
  it("lets an oldest override keep a player the calculated window would age out", () => {
    const calculated = dyb([division("15-17", 15, 17, 1)]);
    const overridden = dyb([
      division("15-17", 15, 17, 1, { oldestBirthdate: "2008-01-01" }),
    ]);
    const buckets = [bucket("2008-06-01", 2), bucket("2007-12-31", 1)];
    const before = assignBuckets(buckets, calculated, SEASON);
    const after = assignBuckets(buckets, overridden, SEASON);
    assert.equal(byCode(before, "15-17").total, 0);
    assert.equal(before.agedOut.own, 3);
    assert.equal(byCode(after, "15-17").own, 2);
    assert.equal(after.agedOut.own, 1);
  });

  it("lets a youngest override win over the calculated window", () => {
    // Calculated 10U runs through 2017-04-30. The override closes it on 2017-01-15,
    // so 2017-02-01 falls in the gap before 9U instead of staying in 10U.
    const config = dyb([
      division("10U", 10, 10, 1, { youngestBirthdate: "2017-01-15" }),
      division("11U", 11, 11, 2),
      division("9U", 9, 9, 3),
    ]);
    const assigned = assignBuckets(
      [bucket("2017-01-15", 3), bucket("2017-02-01", 4), bucket("2016-05-01", 1)],
      config,
      SEASON,
    );
    assert.equal(byCode(assigned, "10U").own, 4);
    assert.equal(byCode(assigned, "11U").own, 0);
    assert.equal(byCode(assigned, "9U").own, 0);
    assert.equal(assigned.unmatched.own, 4);
    assert.equal(assigned.tooYoung.own, 0);
  });
});

describe("carryover and fallback constants", () => {
  it("returns null only when the spring distinct count is 0", () => {
    assert.equal(carryoverRate(0, 0), null);
    assert.equal(carryoverRate(0, 5), null);
    assert.equal(carryoverRate(10, 0), 0);
    assert.equal(carryoverRate(439, 128), 128 / 439);
    assert.equal(carryoverRate(867, 384), 384 / 867);
  });

  it("publishes the default roster and the two fallback rates", () => {
    assert.deepEqual(DEFAULT_ROSTER, { min: 11, max: 12 });
    assert.deepEqual(FALLBACK_RETENTION, { gonzales: 0.29, ascension: 0.44 });
    assert.equal(Object.keys(FALLBACK_RETENTION).length, 2);
    assert.ok(Math.abs(carryoverRate(439, 128)! - FALLBACK_RETENTION.gonzales) < 0.01);
    assert.ok(Math.abs(carryoverRate(867, 384)! - FALLBACK_RETENTION.ascension) < 0.01);
  });
});

describe("assignBuckets rejects bad buckets", () => {
  const config = dyb([division("10U", 10, 10, 1)]);

  it("rejects an unknown pool and a negative count", () => {
    assert.throws(() =>
      assignBuckets([{ birthDate: "2016-06-01", count: 1, pool: "other" as "own" }], config, SEASON),
    );
    assert.throws(() => assignBuckets([bucket("2016-06-01", -1)], config, SEASON));
  });

  it("counts an unparseable birth date as unmatched", () => {
    const assigned = assignBuckets([bucket("2016-02-31", 2), bucket("not-a-date", 1, "feeder")], config, SEASON);
    assert.deepEqual(assigned.unmatched, { own: 2, feeder: 1, total: 3 });
    assert.equal(assigned.distinctTotal.total, 0);
  });
});
