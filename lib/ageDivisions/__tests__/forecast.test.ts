import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { splitDivisionAt } from "../forecastView";
import { forecastTimelineLayout } from "../springTimeline";
import {
  DEFAULT_FEEDER_SHARE,
  DEFAULT_RETURN_RATE,
  DEFAULT_ROSTER,
  EVEN_SPLIT_MIX_NOTE,
  FALLBACK_RETENTION,
  appliedFeeder,
  assignBuckets,
  carryoverRate,
  compareConfigs,
  effectiveCutoffDate,
  eligibilityContrasts,
  projectDivision,
  teamCountRange,
  type BirthBucket,
  type DivisionAssignment,
  type ForecastConfig,
  type MixSeason,
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
      feederShare: 1,
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
      projectDivision({ own: 10, feeder: 5 }, { retentionRate: 1, includeFeeder: true, feederShare: 1 }),
      { pool: 15, expected: 15 },
    );
  });

  it("rounds a fractional rate and keeps 0 and 1 exact", () => {
    assert.deepEqual(
      projectDivision({ own: 10, feeder: 7 }, { retentionRate: 0, includeFeeder: true, feederShare: 1 }),
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
      projectDivision({ own: 10, feeder: 7 }, { retentionRate: 0.25, includeFeeder: true, feederShare: 1 }),
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
      { retentionRate: 0.5, includeFeeder: true, feederShare: 1, rosterFor },
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
      feederShare: 1,
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
    assert.equal(excluded.current.feeder, 0);
    assert.equal(excluded.current.pool, 20);
    assert.equal(excluded.current.expected, 10);
    assert.equal(excluded.current.minTeams, 1);
    assert.equal(excluded.current.maxTeams, 1);
    assert.equal(included.currentShortRoster, false);
    assert.equal(excluded.currentShortRoster, true);
    assert.equal(included.currentOverlap, 0);
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

describe("return rate, feeder share, and shared pools", () => {
  it("uses a 100% return rate by default and does not apply the carryover reference", () => {
    assert.equal(DEFAULT_RETURN_RATE, 1);
    assert.notEqual(DEFAULT_RETURN_RATE, FALLBACK_RETENTION.gonzales);
    assert.notEqual(DEFAULT_RETURN_RATE, FALLBACK_RETENTION.ascension);
    const full = projectDivision({ own: 10, feeder: 0 }, { retentionRate: DEFAULT_RETURN_RATE, includeFeeder: false });
    const reference = projectDivision(
      { own: 10, feeder: 0 },
      { retentionRate: FALLBACK_RETENTION.gonzales, includeFeeder: false },
    );
    assert.equal(full.expected, 10);
    assert.equal(reference.expected, 3);
  });

  it("applies the default 10% feeder share per division, and 0 when the toggle is off", () => {
    assert.equal(DEFAULT_FEEDER_SHARE, 0.1);
    const config = dyb([division("9U", 9, 9, 1)]);
    const buckets = [bucket("2017-06-01", 4), bucket("2017-06-01", 15, "feeder")];
    const shared = compareConfigs(buckets, config, config, SEASON, {
      retentionRate: DEFAULT_RETURN_RATE,
      includeFeeder: true,
      rosterFor,
    });
    const row = shared.rows[0]!;
    assert.equal(row.current.own, 4);
    assert.equal(row.current.feeder, 2);
    assert.equal(row.current.pool, 6);
    assert.equal(row.current.expected, 6);
    assert.equal(shared.league.current.feeder, 2);
    assert.equal(shared.league.current.expected, 6);

    const off = compareConfigs(buckets, config, config, SEASON, {
      retentionRate: 1,
      includeFeeder: false,
      rosterFor,
    });
    assert.equal(off.rows[0]!.current.feeder, 0);
    assert.equal(off.rows[0]!.current.pool, 4);
    assert.equal(off.league.current.expected, 4);

    const edited = compareConfigs(buckets, config, config, SEASON, {
      retentionRate: 1,
      includeFeeder: true,
      feederShare: 0.4,
      rosterFor,
    });
    assert.equal(edited.rows[0]!.current.feeder, 6);
    assert.equal(edited.rows[0]!.current.pool, 10);
    assert.equal(edited.league.current.feeder, 6);
  });

  it("counts an overlapping 6U Minor/Major pool once in league and team totals", () => {
    const config = dyb([
      division("6U-minor", 6, 6, 1),
      division("6U-major", 6, 6, 2),
      division("8U", 8, 8, 3),
    ]);
    config.divisions[0]!.label = "6U Minor";
    config.divisions[1]!.label = "6U Major";
    const buckets = [bucket("2020-06-01", 20), bucket("2018-06-01", 12)];
    const compared = compareConfigs(buckets, config, config, SEASON, {
      retentionRate: 1,
      includeFeeder: false,
      rosterFor,
    });
    const minor = compared.rows.find((row) => row.code === "6U-minor");
    const major = compared.rows.find((row) => row.code === "6U-major");
    const older = compared.rows.find((row) => row.code === "8U");
    assert.ok(minor && major && older);
    assert.equal(minor.current.own, 20);
    assert.equal(major.current.own, 20);
    assert.equal(older.current.own, 12);
    assert.ok(minor.currentSharedPoolId);
    assert.equal(minor.currentSharedPoolId, major.currentSharedPoolId);
    assert.equal(minor.proposedSharedPoolId, major.proposedSharedPoolId);
    assert.equal(older.currentSharedPoolId, null);
    const pool = compared.sharedPools.find((item) => item.codes.includes("6U-minor"));
    assert.ok(pool);
    assert.match(pool.label, /Shared pool/);
    assert.match(pool.label, /6U Minor/);
    assert.match(pool.label, /6U Major/);
    assert.equal(pool.current?.own, 20);
    assert.equal(pool.current?.expected, 20);
    assert.equal(pool.current?.minTeams, 2);
    assert.equal(pool.current?.maxTeams, 2);
    assert.equal(pool.proposed?.minTeams, 2);
    assert.equal(compared.league.current.own, 32);
    assert.equal(compared.league.current.expected, 32);
    assert.equal(compared.league.current.minTeams, 3);
    assert.equal(compared.league.current.maxTeams, 3);
    assert.equal(compared.league.proposed.own, 32);
    assert.equal(compared.league.proposed.minTeams, 3);
    assert.notEqual(compared.league.current.minTeams, minor.current.minTeams + major.current.minTeams + older.current.minTeams);
  });
});

describe("what-if cutoff flows", () => {
  const options = { retentionRate: 1, includeFeeder: false, feederShare: 1, rosterFor };
  const current = dyb([
    division("8U MINOR", 8, 8, 1),
    division("9U KP", 9, 9, 2),
    division("10U KP", 10, 10, 3),
  ]);

  function flowOf(compared: { flows: { from: string; to: string; own: number; feeder: number; total: number }[] }, from: string, to: string) {
    return compared.flows.find((flow) => flow.from === from && flow.to === to);
  }

  it("reports a gap, unmatched players, and a none:gap flow when only 9U oldest moves", () => {
    const proposed = dyb([
      division("8U MINOR", 8, 8, 1),
      division("9U KP", 9, 9, 2, { oldestBirthdate: "2017-09-01" }),
      division("10U KP", 10, 10, 3),
    ]);
    const compared = compareConfigs([bucket("2017-06-15", 3), bucket("2017-07-01", 2, "feeder")], current, proposed, SEASON, options);
    assert.ok(compared.proposedWarnings.some((warning) => warning.kind === "gap"));
    assert.equal(compared.proposed.unmatched.own, 3);
    assert.equal(compared.proposed.unmatched.feeder, 2);
    assert.equal(compared.current.unmatched.total, 0);
    const gap = flowOf(compared, "9U KP", "none:gap");
    assert.ok(gap);
    assert.deepEqual({ own: gap.own, feeder: gap.feeder, total: gap.total }, { own: 3, feeder: 2, total: 5 });
    const nine = compared.rows.find((row) => row.code === "9U KP");
    assert.ok(nine);
    assert.deepEqual(nine.moversOut, { own: 3, feeder: 2, total: 5 });
    assert.deepEqual(nine.moversIn, { own: 0, feeder: 0, total: 0 });
    assert.equal(nine.movers, 5);
  });

  it("moves 9U into 10U with no gap when both sides of the boundary move", () => {
    const proposed = dyb([
      division("8U MINOR", 8, 8, 1),
      division("9U KP", 9, 9, 2, { oldestBirthdate: "2017-09-01" }),
      division("10U KP", 10, 10, 3, { youngestBirthdate: "2017-08-31" }),
    ]);
    const compared = compareConfigs(
      [bucket("2017-06-15", 4), bucket("2018-01-15", 1)],
      current,
      proposed,
      SEASON,
      options,
    );
    assert.equal(compared.proposedWarnings.some((warning) => warning.kind === "gap"), false);
    assert.equal(compared.proposed.unmatched.total, 0);
    const moved = flowOf(compared, "9U KP", "10U KP");
    assert.ok(moved);
    assert.equal(moved.own, 4);
    assert.equal(moved.total, 4);
    assert.equal(flowOf(compared, "9U KP", "none:gap"), undefined);
    const ten = compared.rows.find((row) => row.code === "10U KP");
    assert.ok(ten);
    assert.deepEqual(ten.moversIn, { own: 4, feeder: 0, total: 4 });
    assert.deepEqual(ten.moversOut, { own: 0, feeder: 0, total: 0 });
  });

  it("joins an overlap as a sorted code set", () => {
    const proposed = dyb([
      division("8U MINOR", 8, 8, 1, { oldestBirthdate: "2018-01-01" }),
      division("9U KP", 9, 9, 2),
      division("10U KP", 10, 10, 3),
    ]);
    const compared = compareConfigs([bucket("2018-01-15", 6)], current, proposed, SEASON, options);
    const overlap = compared.flows.find((flow) => flow.from === "9U KP");
    assert.ok(overlap);
    assert.equal(overlap.to, "8U MINOR+9U KP");
    assert.equal(overlap.own, 6);
    const eight = compared.rows.find((row) => row.code === "8U MINOR");
    const nine = compared.rows.find((row) => row.code === "9U KP");
    assert.ok(eight && nine);
    assert.equal(eight.moversIn.own, 6);
    assert.equal(nine.moversIn.total, 0);
    assert.equal(nine.moversOut.total, 0);
    assert.equal(nine.movers, 0);
  });

  it("keeps flow totals equal to the mover total", () => {
    const proposed = dyb([
      division("8U MINOR", 8, 8, 1, { youngestBirthdate: "2018-12-31" }),
      division("9U KP", 9, 9, 2, { oldestBirthdate: "2017-09-01", youngestBirthdate: "2018-08-31" }),
      division("10U KP", 10, 10, 3, { youngestBirthdate: "2017-08-31" }),
    ]);
    const compared = compareConfigs(
      [
        bucket("2017-06-15", 3),
        bucket("2017-06-15", 2, "feeder"),
        bucket("2018-06-01", 5, "feeder"),
        bucket("2018-01-15", 1),
        bucket("2016-06-01", 4),
      ],
      current,
      proposed,
      SEASON,
      { ...options, includeFeeder: true },
    );
    const flowTotal = compared.flows.reduce((sum, flow) => sum + flow.total, 0);
    assert.equal(flowTotal, compared.movers);
    assert.ok(compared.flows.every((flow) => flow.from !== flow.to));
    assert.ok(compared.flows.every((flow) => flow.total === flow.own + flow.feeder));
    assert.equal(compared.currentWarnings.some((warning) => warning.kind === "gap"), false);
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

describe("combine, split, and LL vs DYB counts", () => {
  const rosterFor = () => DEFAULT_ROSTER;
  const seven = division("7U MINOR", 7, 7, 1);
  const eight = division("8U MINOR", 8, 8, 2);

  it("counts a combined window once and keeps the shared pool from double counting", () => {
    const current = dyb([seven, eight]);
    const combined = dyb([division("7/8U MINOR", 7, 8, 1)]);
    const buckets = [bucket("2020-01-01", 10), bucket("2019-01-01", 8), bucket("2019-06-01", 4)];
    const compared = compareConfigs(buckets, current, combined, SEASON, {
      retentionRate: 1,
      includeFeeder: false,
      feederShare: 0.1,
      rosterFor,
    });
    assert.equal(compared.rows.find((row) => row.code === "7U MINOR")?.current.pool, 14);
    assert.equal(compared.rows.find((row) => row.code === "8U MINOR")?.current.pool, 8);
    assert.equal(compared.rows.find((row) => row.code === "7/8U MINOR")?.proposed.pool, 22);
    assert.equal(compared.league.current.pool, 22);
    assert.equal(compared.league.proposed.pool, 22);
    const overlapCurrent = dyb([
      division("6U MINOR", 6, 6, 1),
      division("6U MAJOR", 6, 6, 2),
    ]);
    const overlapProposed = dyb([division("6U MINOR/6U MAJOR", 6, 6, 1)]);
    const overlap = compareConfigs([bucket("2020-08-01", 10)], overlapCurrent, overlapProposed, SEASON, {
      retentionRate: 1,
      includeFeeder: false,
      feederShare: 0.1,
      rosterFor,
    });
    assert.equal(overlap.rows.find((row) => row.code === "6U MINOR")?.current.pool, 10);
    assert.equal(overlap.rows.find((row) => row.code === "6U MAJOR")?.current.pool, 10);
    assert.equal(overlap.sharedPools[0]?.current?.pool, 10);
    assert.equal(overlap.league.current.pool, 10);
    assert.equal(overlap.rows.find((row) => row.code === "6U MINOR/6U MAJOR")?.proposed.pool, 10);
    assert.equal(overlap.league.proposed.pool, 10);
  });

  it("matches the 7U plus 8U team and feeder-share arithmetic", () => {
    assert.deepEqual(
      [teamCountRange(173, DEFAULT_ROSTER).minTeams, teamCountRange(173, DEFAULT_ROSTER).maxTeams],
      [15, 15],
    );
    assert.deepEqual(
      [teamCountRange(134, DEFAULT_ROSTER).minTeams, teamCountRange(134, DEFAULT_ROSTER).maxTeams],
      [12, 12],
    );
    assert.deepEqual(
      [teamCountRange(307, DEFAULT_ROSTER).minTeams, teamCountRange(307, DEFAULT_ROSTER).maxTeams],
      [26, 27],
    );
    assert.equal(appliedFeeder(169, { includeFeeder: true, feederShare: 0.1 }), 17);
    assert.equal(appliedFeeder(125, { includeFeeder: true, feederShare: 0.1 }), 13);
    assert.equal(appliedFeeder(294, { includeFeeder: true, feederShare: 0.1 }), 29);

    const current = dyb([seven, eight]);
    const proposed = dyb([division("7/8U MINOR", 7, 8, 1)]);
    const buckets = [bucket("2020-01-01", 169, "feeder"), bucket("2019-01-01", 125, "feeder")];
    const compared = compareConfigs(buckets, current, proposed, SEASON, {
      retentionRate: 1,
      includeFeeder: true,
      feederShare: 0.1,
      rosterFor,
    });
    assert.equal(compared.rows.find((row) => row.code === "7U MINOR")?.current.pool, 17);
    assert.equal(compared.rows.find((row) => row.code === "8U MINOR")?.current.pool, 13);
    assert.equal(compared.rows.find((row) => row.code === "7/8U MINOR")?.proposed.pool, 29);
    assert.equal(compared.league.current.pool, 30);
    assert.equal(compared.league.proposed.pool, 29);
    assert.equal(compared.league.current.minTeams, 4);
    assert.equal(compared.rows.find((row) => row.code === "7/8U MINOR")?.proposed.minTeams, 3);

    const ascension = compareConfigs(
      [bucket("2020-01-01", 173), bucket("2019-01-01", 134)],
      {
        cutoff: { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 },
        divisions: [seven, eight],
      },
      {
        cutoff: { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 },
        divisions: [division("7/8U MINOR", 7, 8, 1)],
      },
      SEASON,
      { retentionRate: 1, includeFeeder: false, feederShare: 0.1, rosterFor },
    );
    assert.equal(ascension.rows.find((row) => row.code === "7U MINOR")?.current.pool, 173);
    assert.equal(ascension.rows.find((row) => row.code === "8U MINOR")?.current.pool, 134);
    assert.equal(ascension.rows.find((row) => row.code === "7/8U MINOR")?.proposed.pool, 307);
    assert.equal(ascension.league.current.pool, 307);
    assert.equal(ascension.league.proposed.pool, 307);
    assert.equal(ascension.league.current.minTeams, 27);
    assert.equal(ascension.rows.find((row) => row.code === "7/8U MINOR")?.proposed.minTeams, 26);
    assert.equal(ascension.rows.find((row) => row.code === "7/8U MINOR")?.proposed.maxTeams, 27);
  });

  it("splits a division so the halves partition the players", () => {
    const current = dyb([division("9U KP", 9, 9, 1)]);
    const proposed = dyb([
      division("9U KP young", 9, 9, 1, { oldestBirthdate: "2018-01-01", youngestBirthdate: "2018-04-30" }),
      division("9U KP old", 9, 9, 2, { oldestBirthdate: "2017-05-01", youngestBirthdate: "2017-12-31" }),
    ]);
    const buckets = [bucket("2017-08-01", 4), bucket("2018-02-01", 6), bucket("2018-02-01", 1, "feeder")];
    const compared = compareConfigs(buckets, current, proposed, SEASON, {
      retentionRate: 1,
      includeFeeder: true,
      feederShare: 1,
      rosterFor,
    });
    assert.equal(compared.rows.find((row) => row.code === "9U KP")?.current.own, 10);
    assert.equal(compared.rows.find((row) => row.code === "9U KP old")?.proposed.own, 4);
    assert.equal(compared.rows.find((row) => row.code === "9U KP young")?.proposed.own, 6);
    assert.equal(compared.rows.find((row) => row.code === "9U KP young")?.proposed.feeder, 1);
    assert.equal(compared.league.current.pool, compared.league.proposed.pool);
    const youngCodes = compared.rows.find((row) => row.code === "9U KP young");
    const oldCodes = compared.rows.find((row) => row.code === "9U KP old");
    assert.ok(youngCodes && oldCodes);
    assert.equal(youngCodes.proposed.own + oldCodes.proposed.own, 10);
  });

  it("counts LL-only, DYB-only, and both for an age span", () => {
    const rows = eligibilityContrasts(
      [
        bucket("2020-06-01", 2),
        bucket("2019-06-01", 3),
        bucket("2020-01-15", 4),
        bucket("2020-06-01", 1, "feeder"),
        bucket("2018-01-01", 9),
      ],
      [seven, eight, division("7/8U MINOR", 7, 8, 3)],
      SEASON,
    );
    const age7 = rows.find((row) => row.code === "7U MINOR");
    assert.ok(age7);
    assert.equal(age7.llOldest, "2019-09-01");
    assert.equal(age7.llYoungest, "2020-08-31");
    assert.equal(age7.dybOldest, "2019-05-01");
    assert.equal(age7.dybYoungest, "2020-04-30");
    assert.deepEqual(age7.ll, { own: 6, feeder: 1 });
    assert.deepEqual(age7.dyb, { own: 7, feeder: 0 });
    assert.deepEqual(age7.both, { own: 4, feeder: 0 });
    assert.deepEqual(age7.llOnly, { own: 2, feeder: 1 });
    assert.deepEqual(age7.dybOnly, { own: 3, feeder: 0 });
    const combined = rows.find((row) => row.code === "7/8U MINOR");
    assert.ok(combined);
    assert.equal(combined.llOldest, "2018-09-01");
    assert.equal(combined.llYoungest, "2020-08-31");
    assert.equal(combined.dybOldest, "2018-05-01");
    assert.equal(combined.dybYoungest, "2020-04-30");
    assert.equal(combined.ll.own, 9);
    assert.equal(combined.dyb.own, 7);
    assert.equal(combined.both.own, 7);
    assert.equal(combined.llOnly.own, 2);
    assert.equal(combined.dybOnly.own, 0);
  });

  it("gives each split half its own eligibility span", () => {
    const parent = division("9U KP", 9, 9, 1);
    const current = dyb([parent]);
    const cutoff = effectiveCutoffDate(current.cutoff, SEASON);
    const split = splitDivisionAt(current.divisions, "9U KP", "2017-12-31", cutoff);
    assert.equal(split.ok, true);
    if (!split.ok) return;
    const unsplit = eligibilityContrasts([bucket("2017-08-01", 4), bucket("2018-02-01", 6)], [parent], SEASON)[0]!;
    const rows = eligibilityContrasts(
      [bucket("2017-08-01", 4), bucket("2018-02-01", 6)],
      split.divisions,
      SEASON,
      current.cutoff,
    );
    const young = rows.find((row) => row.code === "9U KP young");
    const old = rows.find((row) => row.code === "9U KP old");
    assert.ok(young && old);
    assert.notEqual(`${young.dybOldest}..${young.dybYoungest}`, `${old.dybOldest}..${old.dybYoungest}`);
    assert.notEqual(`${young.dybOldest}..${young.dybYoungest}`, `${unsplit.dybOldest}..${unsplit.dybYoungest}`);
    assert.notEqual(`${old.dybOldest}..${old.dybYoungest}`, `${unsplit.dybOldest}..${unsplit.dybYoungest}`);
    assert.equal(old.dyb.own, 4);
    assert.equal(young.dyb.own, 6);
    assert.equal(young.dyb.own + old.dyb.own, unsplit.dyb.own);

    const span = dyb([division("7-8U", 7, 8, 1)]);
    const spanCutoff = effectiveCutoffDate(span.cutoff, SEASON);
    const atBoundary = splitDivisionAt(span.divisions, "7-8U", "2019-04-30", spanCutoff);
    assert.equal(atBoundary.ok, true);
    if (!atBoundary.ok) return;
    const olderHalf = atBoundary.divisions.find((item) => item.code === "7-8U old");
    const youngerHalf = atBoundary.divisions.find((item) => item.code === "7-8U young");
    assert.ok(olderHalf && youngerHalf);
    assert.deepEqual({ minAge: olderHalf.minAge, maxAge: olderHalf.maxAge }, { minAge: 8, maxAge: 8 });
    assert.deepEqual({ minAge: youngerHalf.minAge, maxAge: youngerHalf.maxAge }, { minAge: 7, maxAge: 7 });
    const halves = eligibilityContrasts([], atBoundary.divisions, SEASON, span.cutoff);
    const olderRow = halves.find((row) => row.code === "7-8U old");
    const youngerRow = halves.find((row) => row.code === "7-8U young");
    assert.ok(olderRow && youngerRow);
    assert.equal(`${olderRow.dybOldest}..${olderRow.dybYoungest}`, "2018-05-01..2019-04-30");
    assert.equal(`${youngerRow.dybOldest}..${youngerRow.dybYoungest}`, "2019-05-01..2020-04-30");
    assert.notEqual(olderRow.llOldest, youngerRow.llOldest);
  });

  it("shifts a dragged edge onto both leagues and keeps the season window", () => {
    const season = dyb([
      division("8U", 8, 8, 1, { oldestBirthdate: "2018-06-01" }),
      division("9U", 9, 9, 2, { youngestBirthdate: "2018-05-31" }),
    ]);
    const rows = eligibilityContrasts([bucket("2018-07-15", 1)], season.divisions, SEASON, season.cutoff);
    const eight = rows.find((row) => row.code === "8U");
    const nine = rows.find((row) => row.code === "9U");
    assert.ok(eight && nine);
    assert.equal(eight.dybOldest, "2018-06-01");
    assert.equal(eight.dybYoungest, "2019-04-30");
    assert.equal(nine.dybOldest, "2017-05-01");
    assert.equal(nine.dybYoungest, "2018-05-31");
    assert.notEqual(`${eight.llOldest}..${eight.llYoungest}`, `${eight.dybOldest}..${eight.dybYoungest}`);
    assert.notEqual(`${nine.llOldest}..${nine.llYoungest}`, `${nine.dybOldest}..${nine.dybYoungest}`);
    assert.equal(eight.llOldest, "2018-10-02");
    assert.equal(eight.llYoungest, "2019-08-31");
    assert.equal(nine.llOldest, "2017-09-01");
    assert.equal(nine.llYoungest, "2018-10-01");
    assert.equal(nine.ll.own, 1);
    assert.equal(eight.ll.own, 0);
    assert.equal(eight.dyb.own, 1);
    assert.equal(nine.dyb.own, 0);
    for (const row of [eight, nine]) {
      assert.equal(row.llOldest <= row.llYoungest, true);
      assert.equal(row.dybOldest <= row.dybYoungest, true);
    }

    const pulled = dyb([division("8U", 8, 8, 1, { youngestBirthdate: "2018-07-01" })]);
    const narrow = eligibilityContrasts([bucket("2018-07-15", 1)], pulled.divisions, SEASON, pulled.cutoff)[0]!;
    assert.equal(narrow.dybOldest, "2018-05-01");
    assert.equal(narrow.dybYoungest, "2018-07-01");
    assert.equal(narrow.llOldest <= narrow.llYoungest, true);
    assert.notEqual(`${narrow.llOldest}..${narrow.llYoungest}`, "2018-09-01..2018-07-01");
    assert.notEqual(`${narrow.llOldest}..${narrow.llYoungest}`, `${narrow.dybOldest}..${narrow.dybYoungest}`);

    const bothEdges = dyb([
      division("8U", 8, 8, 1, { oldestBirthdate: "2018-06-01", youngestBirthdate: "2019-03-01" }),
    ]);
    const both = eligibilityContrasts([], bothEdges.divisions, SEASON, bothEdges.cutoff)[0]!;
    assert.equal(both.dybOldest, "2018-06-01");
    assert.equal(both.dybYoungest, "2019-03-01");
    assert.notEqual(`${both.llOldest}..${both.llYoungest}`, `${both.dybOldest}..${both.dybYoungest}`);
    assert.equal(both.llOldest <= both.llYoungest, true);
    assert.equal(both.dybOldest <= both.dybYoungest, true);
  });
});

describe("spring overlap mix weights", () => {
  const rosterFor = () => DEFAULT_ROSTER;
  const older = "2015-06-01";
  const younger = "2016-08-01";

  function pair(minAge = 10, maxAge = 11, overrides: { youngestBirthdate?: string } = {}) {
    return dyb([
      division("MAJORS", minAge, maxAge, 1, overrides),
      division("MINORS", minAge, maxAge, 2, overrides),
      division("12U", 12, 12, 3),
    ]);
  }

  function history(seasons: MixSeason[]): { seasons: MixSeason[] } {
    return { seasons };
  }

  function players(birthDate: string, divisionName: string, count: number) {
    return { birthDate, divisionName, ageGroup: "", count };
  }

  const eightyThreeHundred: MixSeason[] = [
    {
      seasonYear: 2025,
      players: [players(older, "Majors", 80), players(younger, "Minors", 220)],
    },
  ];

  const pool = [bucket(older, 80), bucket(younger, 220), bucket("2014-06-01", 12)];

  it("weights an 80 of 300 Majors mix to about 27 percent", () => {
    const config = pair();
    config.divisions[0]!.label = "Majors";
    config.divisions[1]!.label = "Minors";
    const compared = compareConfigs(pool, config, config, SEASON, {
      retentionRate: 1,
      includeFeeder: false,
      rosterFor,
      mix: history(eightyThreeHundred),
    });
    const majors = compared.rows.find((row) => row.code === "MAJORS");
    const minors = compared.rows.find((row) => row.code === "MINORS");
    const olderDivision = compared.rows.find((row) => row.code === "12U");
    assert.ok(majors && minors && olderDivision);
    assert.equal(majors.current.pool, 80);
    assert.equal(majors.current.expected, 80);
    assert.equal(majors.currentMix?.sharePercent, 27);
    assert.equal(majors.currentMix?.note, "27% of window, Spring 2025");
    assert.ok(Math.abs((majors.currentMix?.share ?? 0) - 80 / 300) < 1e-9);
    assert.equal(minors.current.pool, 220);
    assert.equal(minors.current.expected, 220);
    assert.equal(minors.currentMix?.sharePercent, 73);
    assert.equal(minors.currentMix?.note, "73% of window, Spring 2025");
    assert.deepEqual(
      [majors.current.minTeams, majors.current.maxTeams],
      [teamCountRange(80, DEFAULT_ROSTER).minTeams, teamCountRange(80, DEFAULT_ROSTER).maxTeams],
    );
    assert.equal(olderDivision.current.pool, 12);
    assert.equal(olderDivision.current.expected, 12);
    assert.equal(olderDivision.currentMix, null);
    assert.equal(compared.sharedPools[0]?.current?.pool, 300);
    assert.equal(compared.league.current.pool, 312);
    assert.equal(compared.league.current.expected, 312);

    const half = compareConfigs(pool, config, config, SEASON, {
      retentionRate: 0.5,
      includeFeeder: false,
      rosterFor,
      mix: history(eightyThreeHundred),
    });
    assert.equal(half.rows.find((row) => row.code === "MAJORS")?.current.expected, 40);
    assert.equal(half.rows.find((row) => row.code === "MINORS")?.current.expected, 110);
  });

  it("averages prior Springs with equal weight per season", () => {
    const config = pair();
    config.divisions[0]!.label = "Majors";
    config.divisions[1]!.label = "Minors";
    const seasons: MixSeason[] = [
      { seasonYear: 2024, players: [] },
      { seasonYear: 2025, players: [players(older, "Majors", 8), players(younger, "Minors", 2)] },
      { seasonYear: 2026, players: [players(older, "Majors", 10), players(younger, "Minors", 90)] },
      { seasonYear: 2027, players: [players(older, "Majors", 300)] },
    ];
    const compared = compareConfigs([bucket(older, 200)], config, config, SEASON, {
      retentionRate: 1,
      includeFeeder: false,
      rosterFor,
      mix: history(seasons),
    });
    const majors = compared.rows.find((row) => row.code === "MAJORS");
    const minors = compared.rows.find((row) => row.code === "MINORS");
    assert.ok(majors && minors);
    assert.equal(majors.current.expected, 90);
    assert.equal(minors.current.expected, 110);
    assert.equal(majors.currentMix?.note, "45% of window, avg of Spring 2025\u20132026");
    assert.deepEqual(majors.currentMix?.seasons, [2025, 2026]);
    assert.equal(majors.currentMix?.evenSplit, false);
  });

  it("uses an even split and a warning when Spring history is empty or a division is new", () => {
    const config = pair();
    config.divisions[0]!.label = "Majors";
    config.divisions[1]!.label = "Minors";
    const empty = compareConfigs(pool, config, config, SEASON, {
      retentionRate: 1,
      includeFeeder: false,
      rosterFor,
      mix: history([]),
    });
    const majors = empty.rows.find((row) => row.code === "MAJORS");
    const minors = empty.rows.find((row) => row.code === "MINORS");
    assert.ok(majors && minors);
    assert.equal(majors.current.pool, 150);
    assert.equal(minors.current.pool, 150);
    assert.equal(majors.current.expected, 150);
    assert.equal(majors.currentMix?.evenSplit, true);
    assert.equal(majors.currentMix?.note, EVEN_SPLIT_MIX_NOTE);
    assert.equal(minors.currentMix?.note, EVEN_SPLIT_MIX_NOTE);
    assert.equal(empty.league.current.pool, 312);

    const withRookie = dyb([
      division("MAJORS", 10, 11, 1),
      division("MINORS", 10, 11, 2),
      division("ROOKIE", 10, 11, 3),
    ]);
    withRookie.divisions[0]!.label = "Majors";
    withRookie.divisions[1]!.label = "Minors";
    withRookie.divisions[2]!.label = "Rookie";
    const fresh = compareConfigs([bucket(older, 300)], withRookie, withRookie, SEASON, {
      retentionRate: 1,
      includeFeeder: false,
      rosterFor,
      mix: history(eightyThreeHundred),
    });
    for (const code of ["MAJORS", "MINORS", "ROOKIE"]) {
      const row = fresh.rows.find((item) => item.code === code);
      assert.ok(row);
      assert.equal(row.current.expected, 100);
      assert.equal(row.currentMix?.evenSplit, true);
      assert.equal(row.currentMix?.note, EVEN_SPLIT_MIX_NOTE);
    }
  });

  it("leaves a non-overlapping division and the Fall path on the full window", () => {
    const config = pair();
    config.divisions[0]!.label = "Majors";
    config.divisions[1]!.label = "Minors";
    const fall = compareConfigs(pool, config, config, SEASON, {
      retentionRate: 1,
      includeFeeder: false,
      rosterFor,
    });
    assert.equal(fall.rows.find((row) => row.code === "MAJORS")?.current.pool, 300);
    assert.equal(fall.rows.find((row) => row.code === "MINORS")?.current.pool, 300);
    assert.equal(fall.rows.find((row) => row.code === "12U")?.current.pool, 12);
    assert.equal(fall.rows.find((row) => row.code === "MAJORS")?.currentMix, undefined);
    assert.equal(fall.league.current.pool, 312);
    assert.equal(forecastTimelineLayout({ org: "fallball" }), "classic");
    assert.equal(forecastTimelineLayout({ org: "gonzales" }), "spring-lanes");
  });

  it("changes shares when the proposed window drops one side of the mix", () => {
    const current = pair();
    current.divisions[0]!.label = "Majors";
    current.divisions[1]!.label = "Minors";
    const proposed = pair(10, 11, { youngestBirthdate: "2016-04-30" });
    proposed.divisions[0]!.label = "Majors";
    proposed.divisions[1]!.label = "Minors";
    proposed.divisions[2]!.label = "12U";
    const compared = compareConfigs(pool, current, proposed, SEASON, {
      retentionRate: 1,
      includeFeeder: false,
      rosterFor,
      mix: history([
        {
          seasonYear: 2025,
          players: [players(older, "Majors", 80), players(younger, "Minors", 220)],
        },
        {
          seasonYear: 2026,
          players: [players(older, "Majors", 80), players(younger, "Minors", 220)],
        },
      ]),
    });
    const currentMajors = compared.rows.find((row) => row.code === "MAJORS");
    const proposedMajors = currentMajors?.proposed;
    const proposedMinors = compared.rows.find((row) => row.code === "MINORS")?.proposed;
    assert.equal(currentMajors?.current.expected, 80);
    assert.equal(currentMajors?.currentMix?.note, "27% of window, avg of Spring 2025\u20132026");
    assert.equal(proposedMajors?.expected, 80);
    assert.equal(proposedMajors?.pool, 80);
    assert.equal(currentMajors?.proposedMix?.sharePercent, 100);
    assert.equal(currentMajors?.proposedMix?.note, "100% of window, avg of Spring 2025\u20132026");
    assert.equal(proposedMinors?.expected, 0);
    assert.equal(compared.rows.find((row) => row.code === "MINORS")?.proposedMix?.sharePercent, 0);
    assert.equal(compared.rows.find((row) => row.code === "12U")?.proposed.pool, 12);
  });
});
