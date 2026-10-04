/**
 * Forecast loader cases. Imported under the react-server condition so the
 * server-only marker does not throw. The wrapper test launches this file.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";
import type { ContentOrgId } from "@/lib/siteConfig";

import { leagueDivisionDefaults } from "../defaults";
import {
  createPrismaForecastReader,
  forecastAuthFailure,
  readLeagueRosterMap,
  rosterMapFromLeagueDivisions,
  runDivisionForecast,
  type EnrollmentLine,
  type ForecastDeps,
  type ForecastPayload,
  type ForecastPrisma,
  type ForecastReader,
  type RosterLine,
} from "../forecastData";
import {
  getSeasonDivisionAges,
  saveLeagueDefaults,
  saveSeasonDivisionAges,
  type DivisionAgeDb,
  type LeagueDefaultsRow,
} from "../persistence";
import type { SeasonDivisionAgesView } from "../schema";

const NINE_U_BIRTH = "2018-01-15";
const AGED_OUT_BIRTH = "2016-01-01";
const TOO_YOUNG_BIRTH = "2019-06-01";

function line(overrides: Partial<EnrollmentLine> = {}): EnrollmentLine {
  return {
    fullName: "Player One",
    birthDate: NINE_U_BIRTH,
    orderPaymentStatus: "Completed",
    divisionName: "9U",
    ageGroup: "9U",
    ...overrides,
  };
}

function rosterLine(overrides: Partial<RosterLine> = {}): RosterLine {
  return { fullName: "Player One", birthDate: NINE_U_BIRTH, ageGroup: "9U", ...overrides };
}

function nineUView(source: SeasonDivisionAgesView["source"] = "season"): SeasonDivisionAgesView {
  return {
    source,
    storageReady: true,
    storageNote: null,
    cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
    divisions: [{ code: "9U", label: "9U", minAge: 9, maxAge: 9, sortOrder: 1 }],
    confirmedAt: null,
    confirmedByAdminId: null,
    updatedAt: null,
    updatedByAdminId: null,
  };
}

class FakeReader implements ForecastReader {
  enrollments = new Map<string, EnrollmentLine[]>();
  rosters = new Map<string, RosterLine[]>();
  missing = new Set<string>();
  calls: string[] = [];
  boom: Error | null = null;

  putEnrollment(org: ContentOrgId, year: number, rows: EnrollmentLine[]) {
    this.enrollments.set(`${org}:${year}`, rows);
  }

  putRoster(org: ContentOrgId, year: number, rows: RosterLine[]) {
    this.rosters.set(`${org}:${year}`, rows);
  }

  async listEnrollment(org: ContentOrgId, seasonYear: number) {
    this.calls.push(`enrollment:${org}:${seasonYear}`);
    if (this.boom) throw this.boom;
    const key = `${org}:${seasonYear}`;
    if (this.missing.has(`enrollment:${key}`)) throw { code: "P2021" };
    return this.enrollments.get(key) ?? [];
  }

  async listRoster(org: ContentOrgId, seasonYear: number) {
    this.calls.push(`roster:${org}:${seasonYear}`);
    if (this.boom) throw this.boom;
    const key = `${org}:${seasonYear}`;
    if (this.missing.has(`roster:${key}`)) throw { code: "P2022" };
    return this.rosters.get(key) ?? [];
  }
}

function forbiddenKey(key: string): boolean {
  return /birthdate|e-?mail|phone|firstname|lastname|fullname|^name$|guardian|postal|street|rawrow|^id$|playerid|rowid/i.test(
    key,
  );
}

function assertNoPii(value: unknown, path: string, leaked: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPii(item, `${path}[${index}]`, leaked));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbiddenKey(key), false, `forbidden key ${path}.${key}`);
      assertNoPii(child, `${path}.${key}`, leaked);
    }
    return;
  }
  if (typeof value !== "string") return;
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value), false, `${path} email`);
  assert.equal(/\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(value), false, `${path} phone`);
  const coverageWindow = /\.(currentWarnings|proposedWarnings)\[\d+\]\.(from|to)$/.test(path);
  if (!coverageWindow) assert.equal(/\d{4}-\d{2}-\d{2}/.test(value), false, `${path} date`);
  assert.equal(/birthdate/i.test(value), false, `${path} birth label`);
  for (const secret of leaked) {
    assert.equal(value.includes(secret), false, `${path} leaked ${secret}`);
  }
}

const LEAKED = ["Player One", "Player Two", "player.one@example.com", "225-555-0100", "row-secret"];

async function run(
  body: unknown,
  reader: ForecastReader,
  extras: {
    org?: ContentOrgId;
    view?: SeasonDivisionAgesView;
    loadSeasonConfig?: ForecastDeps["loadSeasonConfig"];
    loadRosterMap?: ForecastDeps["loadRosterMap"];
    loadForecastSettings?: ForecastDeps["loadForecastSettings"];
    readJson?: () => Promise<unknown>;
  } = {},
) {
  const result = await runDivisionForecast(
    {
      org: extras.org ?? "gonzales",
      readJson: extras.readJson ?? (async () => body),
    },
    {
      reader,
      loadSeasonConfig: extras.loadSeasonConfig ?? (async () => extras.view ?? nineUView()),
      loadRosterMap: extras.loadRosterMap,
      loadForecastSettings: extras.loadForecastSettings,
    },
  );
  if (result.status === 200) {
    const serialized = JSON.stringify(result.body);
    for (const secret of LEAKED) {
      assert.equal(serialized.includes(secret), false, `response leaked ${secret}`);
    }
    assertNoPii(result.body, "$", LEAKED);
  }
  return result;
}

function ok(result: { status: number; body: unknown }): ForecastPayload {
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body as ForecastPayload;
}

function division(body: ForecastPayload, code: string) {
  const found = body.rows.find((row) => row.code === code);
  assert.ok(found, `missing ${code}`);
  return found;
}

describe("forecast auth", () => {
  it("rejects park directors and board members and allows admin and master admin", () => {
    const denied: AdminRole[] = ["PARK_DIRECTOR", "BOARD_MEMBER"];
    const allowed: AdminRole[] = ["ADMIN", "MASTER_ADMIN"];
    for (const role of denied) {
      assert.equal(canAccessAdminModule(role, "DIVISION_AGES"), false, role);
      const failure = forecastAuthFailure({ ok: false, status: 403, message: "Forbidden" });
      assert.deepEqual(failure, { status: 403, body: { error: "Forbidden" } });
    }
    for (const role of allowed) {
      assert.equal(canAccessAdminModule(role, "DIVISION_AGES"), true, role);
      assert.equal(
        forecastAuthFailure({
          ok: true,
          status: 200,
          admin: { id: "admin-1", email: "admin@example.com", name: null, firstName: null, lastName: null, avatarUrl: null, role, isMaster: role === "MASTER_ADMIN" },
          role,
          orgId: "gonzales",
        }),
        null,
      );
    }
  });
});

describe("forecast request validation", () => {
  it("defaults the source season to 2026 and the target to the next year", async () => {
    let seen = 0;
    const reader = new FakeReader();
    const result = ok(
      await run({}, reader, {
        loadSeasonConfig: async (_org, year) => {
          seen = year;
          return nineUView();
        },
      }),
    );
    assert.equal(result.seasonYear, 2026);
    assert.equal(result.targetSeasonYear, 2027);
    assert.equal(seen, 2027);
    assert.equal(result.includeFeeder, true);
    assert.equal(result.proposedSource, "current");
  });

  it("returns field errors for a bad retention rate and does not read", async () => {
    const reader = new FakeReader();
    const result = await run({ retentionRate: 1.5 }, reader);
    assert.equal(result.status, 400);
    assert.ok(result.status === 400);
    assert.ok(result.body.issues?.some((issue) => issue.startsWith("retentionRate:")));
    assert.deepEqual(reader.calls, []);
  });

  it("rejects a proposed config that is not a division-age table", async () => {
    const reader = new FakeReader();
    const result = await run({ proposed: { cutoff: { cutoffMonth: 13, cutoffDay: 1, yearOffset: 0 }, divisions: [] } }, reader);
    assert.equal(result.status, 400);
    assert.ok(result.status === 400);
    assert.ok((result.body.issues ?? []).length > 0);
    assert.deepEqual(reader.calls, []);
  });

  it("rejects a body that is not JSON", async () => {
    const reader = new FakeReader();
    const result = await run(null, reader, {
      readJson: async () => {
        throw new Error("bad json");
      },
    });
    assert.equal(result.status, 400);
    assert.deepEqual(reader.calls, []);
  });
});

describe("forecast pools", () => {
  it("uses completed enrollment rows and ignores the roster when enrollment exists", async () => {
    const reader = new FakeReader();
    reader.putEnrollment("gonzales", 2026, [
      line(),
      line({ fullName: "Player Pending", orderPaymentStatus: "Pending", birthDate: "2018-02-01" }),
      line({ fullName: "Player Umpire", divisionName: "Umpire Clinic", ageGroup: "Umpire", birthDate: "2018-03-01" }),
      line({ fullName: "PLAYER ONE", orderPaymentStatus: " COMPLETED " }),
    ]);
    reader.putRoster("gonzales", 2026, [rosterLine({ fullName: "Roster Only", birthDate: "2018-04-01" })]);
    reader.putEnrollment("fallball", 2026, []);
    const result = ok(await run({ includeFeeder: false, retentionRate: 1 }, reader));
    assert.equal(result.source, "enrollment");
    assert.equal(result.sources.own.players, 1);
    assert.equal(result.coveragePct, 100);
    assert.equal(division(result, "9U").current.own, 1);
    assert.equal(reader.calls.includes("roster:gonzales:2026"), false);
  });

  it("falls back to roster birth dates when the org has no enrollment rows", async () => {
    const reader = new FakeReader();
    reader.putRoster("gonzales", 2026, [
      rosterLine(),
      rosterLine({ fullName: "Player Missing", birthDate: null }),
      rosterLine({ fullName: "Umpire Roster", ageGroup: "Volunteer Umpire", birthDate: "2018-03-01" }),
    ]);
    reader.putEnrollment("fallball", 2026, []);
    const result = ok(await run({ includeFeeder: false, retentionRate: 1 }, reader));
    assert.equal(result.source, "roster");
    assert.equal(result.sources.own.players, 2);
    assert.equal(result.sources.own.datedPlayers, 1);
    assert.equal(result.coveragePct, 50);
    assert.equal(division(result, "9U").current.own, 1);
    assert.match(result.notes.join(" "), /roster birth dates/);
  });

  it("falls back to the roster when enrollment storage is missing and still returns 200", async () => {
    for (const code of ["P2021", "P2022"] as const) {
      const reader = new FakeReader();
      reader.missing.add("enrollment:gonzales:2026");
      if (code === "P2022") {
        reader.missing.delete("enrollment:gonzales:2026");
        reader.listEnrollment = async (org, year) => {
          reader.calls.push(`enrollment:${org}:${year}`);
          if (org === "gonzales") throw { code: "P2022" };
          return [];
        };
      }
      reader.putRoster("gonzales", 2026, [rosterLine()]);
      const result = ok(await run({ includeFeeder: false, retentionRate: 1 }, reader));
      assert.equal(result.source, "roster");
      assert.equal(division(result, "9U").current.own, 1);
      assert.match(result.notes.join(" "), /Enrollment storage is not available/);
    }
  });

  it("does not use the roster when enrollment rows exist but none are completed players", async () => {
    const reader = new FakeReader();
    reader.putEnrollment("gonzales", 2026, [line({ orderPaymentStatus: "Pending" })]);
    reader.putRoster("gonzales", 2026, [rosterLine({ fullName: "Roster Only" })]);
    reader.putEnrollment("fallball", 2026, []);
    const result = ok(await run({ includeFeeder: false, retentionRate: 1 }, reader));
    assert.equal(result.source, "enrollment");
    assert.equal(result.sources.own.players, 0);
    assert.equal(division(result, "9U").current.own, 0);
    assert.equal(reader.calls.includes("roster:gonzales:2026"), false);
  });

  it("keeps an ascension player out of the feeder pool when the name and birth date already belong to Gonzales", async () => {
    const reader = new FakeReader();
    reader.putEnrollment("gonzales", 2026, [line({ fullName: "Player-One" })]);
    reader.putEnrollment("ascension", 2026, [
      line({ fullName: "player one" }),
      line({ fullName: "Player Two", birthDate: "2018-02-01" }),
    ]);
    reader.putEnrollment("fallball", 2026, []);
    const result = ok(await run({ retentionRate: 1, feederShare: 1 }, reader));
    assert.equal(result.includeFeeder, true);
    const row = division(result, "9U");
    assert.equal(row.current.own, 1);
    assert.equal(row.current.feeder, 1);
    assert.equal(row.current.pool, 2);
    assert.equal(result.sources.feeder.players, 1);
    assert.equal(result.sources.feeder.source, "enrollment");
  });

  it("ignores includeFeeder for leagues other than Gonzales", async () => {
    const reader = new FakeReader();
    reader.putEnrollment("ascension", 2026, [line()]);
    reader.putEnrollment("fallball", 2026, []);
    const result = ok(await run({ includeFeeder: true, retentionRate: 1 }, reader, { org: "ascension" }));
    assert.equal(result.includeFeeder, false);
    assert.equal(result.sources.feeder.source, "none");
    assert.equal(division(result, "9U").current.feeder, 0);
    assert.equal(division(result, "9U").current.own, 1);
    assert.equal(reader.calls.includes("enrollment:gonzales:2026"), false);
  });

  it("leaves feeder counts out when Gonzales turns the feeder pool off", async () => {
    const reader = new FakeReader();
    reader.putEnrollment("gonzales", 2026, [line()]);
    reader.putEnrollment("ascension", 2026, [line({ fullName: "Player Two" })]);
    reader.putEnrollment("fallball", 2026, []);
    const result = ok(await run({ includeFeeder: false, retentionRate: 1 }, reader));
    assert.equal(division(result, "9U").current.pool, 1);
    assert.equal(division(result, "9U").current.feeder, 0);
    assert.equal(reader.calls.includes("enrollment:ascension:2026"), false);
  });
});

describe("forecast carryover and retention", () => {
  it("counts spring players who also have a completed Fall Ball registration", async () => {
    const reader = new FakeReader();
    reader.putEnrollment("gonzales", 2026, [line(), line({ fullName: "Player Two", birthDate: "2018-02-02" })]);
    reader.putEnrollment("fallball", 2026, [
      line({ orderPaymentStatus: "Pending" }),
      line({ fullName: "Player Two", birthDate: "2018-02-02", divisionName: "Umpire Clinic" }),
      line({ fullName: "Player Two", birthDate: "2018-02-02", divisionName: "10U" }),
    ]);
    const result = ok(await run({ includeFeeder: false }, reader));
    assert.equal(result.carryover.springDistinct, 2);
    assert.equal(result.carryover.carried, 1);
    assert.equal(result.carryover.rate, 0.5);
    assert.equal(result.retention.source, "default");
    assert.equal(result.retention.applied, 1);
    assert.equal(division(result, "9U").current.expected, 2);
    assert.notEqual(result.retention.applied, result.carryover.rate);
  });

  it("keeps a missing carryover as reference and still uses the 100% return rate", async () => {
    const reader = new FakeReader();
    reader.putEnrollment(
      "gonzales",
      2026,
      Array.from({ length: 10 }, (_, index) => line({ fullName: `Player ${index}` })),
    );
    reader.putEnrollment("fallball", 2026, [line({ fullName: "Someone Else", birthDate: "2018-03-03" })]);
    const result = ok(await run({ includeFeeder: false }, reader));
    assert.equal(result.carryover.rate, null);
    assert.equal(result.carryover.carried, 0);
    assert.match(result.carryover.note ?? "", /reference only/);
    assert.equal(result.retention.source, "default");
    assert.equal(result.retention.applied, 1);
    assert.equal(division(result, "9U").current.own, 10);
    assert.equal(division(result, "9U").current.expected, 10);
  });

  it("does not match on a name alone when the birth date is missing", async () => {
    const reader = new FakeReader();
    reader.putEnrollment("gonzales", 2026, [line({ birthDate: null })]);
    reader.putEnrollment("fallball", 2026, [line({ birthDate: null })]);
    const result = ok(await run({ includeFeeder: false }, reader));
    assert.equal(result.carryover.springDistinct, 1);
    assert.equal(result.carryover.carried, 0);
    assert.equal(result.carryover.rate, null);
    assert.equal(result.coveragePct, 0);
  });

  it("lets a request retention rate override the computed and fallback values", async () => {
    const reader = new FakeReader();
    reader.putEnrollment("gonzales", 2026, [line(), line({ fullName: "Player Two" })]);
    reader.putEnrollment("fallball", 2026, [line(), line({ fullName: "Player Two" })]);
    const result = ok(await run({ includeFeeder: false, retentionRate: 0.5 }, reader));
    assert.equal(result.carryover.rate, 1);
    assert.equal(result.retention.source, "override");
    assert.equal(result.retention.applied, 0.5);
    assert.equal(division(result, "9U").current.expected, 1);
  });

  it("uses a saved league return rate and an edited feeder share", async () => {
    const reader = new FakeReader();
    reader.putEnrollment(
      "gonzales",
      2026,
      Array.from({ length: 10 }, (_, index) => line({ fullName: `Own ${index}`, birthDate: "2018-01-15" })),
    );
    reader.putEnrollment(
      "ascension",
      2026,
      Array.from({ length: 10 }, (_, index) => line({ fullName: `Feeder ${index}`, birthDate: "2018-02-02" })),
    );
    reader.putEnrollment("fallball", 2026, [line({ fullName: "Own 0", birthDate: "2018-01-15" })]);
    const saved = ok(
      await run({ includeFeeder: true }, reader, {
        loadForecastSettings: async () => ({
          roster: new Map(),
          returnRate: 0.5,
          feederShare: 0.1,
          returnRateSource: "league",
          feederShareSource: "league",
        }),
      }),
    );
    assert.equal(saved.carryover.rate, 0.1);
    assert.equal(saved.retention.source, "league");
    assert.equal(saved.retention.applied, 0.5);
    assert.equal(saved.feederShare, 0.1);
    assert.equal(division(saved, "9U").current.own, 10);
    assert.equal(division(saved, "9U").current.feeder, 1);
    assert.equal(division(saved, "9U").current.pool, 11);
    assert.equal(division(saved, "9U").current.expected, 6);
    assert.notEqual(saved.retention.applied, saved.carryover.rate);

    const defaults = ok(await run({ includeFeeder: true }, reader));
    assert.equal(defaults.retention.source, "default");
    assert.equal(defaults.retention.applied, 1);
    assert.equal(defaults.feederShare, 0.1);
    assert.equal(division(defaults, "9U").current.feeder, 1);
    assert.equal(division(defaults, "9U").current.expected, 11);

    const edited = ok(await run({ includeFeeder: true, feederShare: 0.5, retentionRate: 1 }, reader));
    assert.equal(edited.feederShare, 0.5);
    assert.equal(division(edited, "9U").current.feeder, 5);
    assert.equal(division(edited, "9U").current.expected, 15);

    const off = ok(await run({ includeFeeder: false }, reader));
    assert.equal(division(off, "9U").current.feeder, 0);
    assert.equal(division(off, "9U").current.pool, 10);
  });
});

describe("forecast configs", () => {
  it("places players in the current division and reports who is outside it", async () => {
    const reader = new FakeReader();
    reader.putEnrollment("gonzales", 2026, [
      line(),
      line({ fullName: "Older Player", birthDate: AGED_OUT_BIRTH }),
      line({ fullName: "Younger Player", birthDate: TOO_YOUNG_BIRTH }),
    ]);
    reader.putEnrollment("fallball", 2026, []);
    const result = ok(await run({ includeFeeder: false, retentionRate: 1 }, reader));
    assert.equal(division(result, "9U").current.own, 1);
    assert.equal(result.current.agedOut.own, 1);
    assert.equal(result.current.tooYoung.own, 1);
    assert.equal(result.current.distinctTotal.own, 1);
  });

  it("resolves the current table in season, league, then built-in order", async () => {
    const memory = memoryDb();
    const builtin = leagueDivisionDefaults("gonzales");
    const reader = new FakeReader();
    reader.putEnrollment("fallball", 2026, []);

    const fromBuiltin = ok(
      await run({ includeFeeder: false, retentionRate: 1 }, reader, {
        loadSeasonConfig: (org, year) => getSeasonDivisionAges(memory.db, org, year),
      }),
    );
    assert.equal(fromBuiltin.currentSource, "builtin");
    assert.ok(fromBuiltin.rows.some((row) => row.code === builtin.divisions[0]?.code));

    await saveLeagueDefaults(
      memory.db,
      "gonzales",
      {
        cutoffMonth: 4,
        cutoffDay: 30,
        yearOffset: 0,
        divisions: [{ code: "LEAGUE", label: "League", minAge: 9, maxAge: 9, sortOrder: 1 }],
      },
      "admin-1",
    );
    const fromLeague = ok(
      await run({ includeFeeder: false, retentionRate: 1 }, reader, {
        loadSeasonConfig: (org, year) => getSeasonDivisionAges(memory.db, org, year),
      }),
    );
    assert.equal(fromLeague.currentSource, "league");
    assert.deepEqual(fromLeague.rows.map((row) => row.code), ["LEAGUE"]);

    await saveSeasonDivisionAges(
      memory.db,
      "gonzales",
      2027,
      {
        cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
        divisions: [{ code: "SEASON", label: "Season", minAge: 9, maxAge: 9, sortOrder: 1 }],
        confirm: false,
      },
      "admin-2",
    );
    const fromSeason = ok(
      await run({ includeFeeder: false, retentionRate: 1 }, reader, {
        loadSeasonConfig: (org, year) => getSeasonDivisionAges(memory.db, org, year),
      }),
    );
    assert.equal(fromSeason.currentSource, "season");
    assert.deepEqual(fromSeason.rows.map((row) => row.code), ["SEASON"]);
  });

  it("compares a proposed table and reports movers", async () => {
    const reader = new FakeReader();
    reader.putEnrollment("gonzales", 2026, [line()]);
    reader.putEnrollment("fallball", 2026, []);
    const result = ok(
      await run(
        {
          includeFeeder: false,
          retentionRate: 1,
          proposed: {
            cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
            divisions: [{ code: "8U", label: "8U", minAge: 8, maxAge: 8, sortOrder: 1 }],
          },
        },
        reader,
      ),
    );
    assert.equal(result.proposedSource, "request");
    assert.equal(division(result, "9U").current.own, 1);
    assert.equal(division(result, "9U").proposed.own, 0);
    assert.equal(division(result, "8U").inCurrent, false);
    assert.ok(result.movers > 0);
    assert.ok(result.flows.some((flow) => flow.from === "9U" && flow.total > 0));
    assert.equal(result.flows.reduce((sum, flow) => sum + flow.total, 0), result.movers);
    assert.ok(Array.isArray(result.currentWarnings));
    assert.ok(Array.isArray(result.proposedWarnings));
    assert.equal(division(result, "9U").moversOut.own, 1);
    assert.equal(division(result, "9U").moversOut.total, division(result, "9U").movers);
    assert.equal(division(result, "9U").moversIn.total, 0);
  });

  it("uses league roster bounds when they are stored and the default 11-12 otherwise", async () => {
    const reader = new FakeReader();
    reader.putEnrollment(
      "gonzales",
      2026,
      Array.from({ length: 15 }, (_, index) => line({ fullName: `Player ${index}` })),
    );
    reader.putEnrollment("fallball", 2026, []);
    const defaults = ok(await run({ includeFeeder: false, retentionRate: 1 }, reader));
    assert.equal(division(defaults, "9U").current.minTeams, 2);

    const custom = ok(
      await run({ includeFeeder: false, retentionRate: 1 }, reader, {
        loadRosterMap: async () => rosterMapFromLeagueDivisions([{ code: "9U", rosterMin: 15, rosterMax: 15 }]),
      }),
    );
    assert.equal(division(custom, "9U").current.minTeams, 1);
    assert.equal(division(custom, "9U").current.maxTeams, 1);
  });

  it("stays on 200 and shows the built-in table when division-age storage is missing", async () => {
    const reader = new FakeReader();
    reader.putEnrollment("fallball", 2026, []);
    const result = ok(
      await run({ includeFeeder: false, retentionRate: 1 }, reader, {
        loadSeasonConfig: async () => {
          throw { code: "P2021" };
        },
      }),
    );
    assert.equal(result.currentSource, "builtin");
    assert.match(result.notes.join(" "), /Settings storage not ready/);
    assert.ok(result.rows.length > 1);
  });
});

describe("forecast failure and prisma reads", () => {
  it("returns 500 without the driver message when a read fails for another reason", async () => {
    const reader = new FakeReader();
    reader.boom = new Error("connection reset secret-token");
    const result = await run({ includeFeeder: false }, reader);
    assert.equal(result.status, 500);
    assert.equal(result.body.error, "Could not load the forecast.");
    assert.equal(JSON.stringify(result.body).includes("secret-token"), false);
  });

  it("selects registration columns needed for counts and drops contact fields", async () => {
    const enrollmentArgs: Record<string, unknown>[] = [];
    const rosterArgs: Record<string, unknown>[] = [];
    const client: ForecastPrisma = {
      enrollment: {
        async findMany(args) {
          enrollmentArgs.push(args);
          return [
            {
              fullName: "Player One",
              birthDate: new Date("2018-01-15T00:00:00.000Z"),
              orderPaymentStatus: "Completed",
              divisionNameRaw: "9U",
              ageGroup: "9U",
              guardianEmail: "player.one@example.com",
              contactPhone: "225-555-0100",
              id: "row-secret",
            },
          ] as unknown as Awaited<ReturnType<ForecastPrisma["enrollment"]["findMany"]>>;
        },
      },
      teamPlayer: {
        async findMany(args) {
          rosterArgs.push(args);
          return [];
        },
      },
      leagueAgeDivisionDefaults: {
        async findUnique() {
          return { divisionsJson: [{ code: "9U", rosterMin: 15, rosterMax: 15 }] };
        },
      },
    };

    const reader = createPrismaForecastReader(client);
    const map = await readLeagueRosterMap(client, "gonzales");
    assert.deepEqual(map.get("9U"), { min: 15, max: 15 });
    const result = ok(
      await run({ includeFeeder: false, retentionRate: 1 }, reader, {
        loadRosterMap: async () => map,
      }),
    );
    assert.equal(division(result, "9U").current.own, 1);
    assert.equal(division(result, "9U").current.minTeams, 1);
    const select = enrollmentArgs[0]?.select as Record<string, unknown>;
    assert.deepEqual(Object.keys(select).sort(), [
      "ageGroup",
      "birthDate",
      "divisionNameRaw",
      "fullName",
      "orderPaymentStatus",
    ]);
    assert.equal("guardianEmail" in select, false);
    assert.equal("id" in select, false);
    assert.equal(rosterArgs.length, 0);

    client.leagueAgeDivisionDefaults.findUnique = async () => {
      throw { code: "P2021" };
    };
    assert.equal((await readLeagueRosterMap(client, "gonzales")).size, 0);
  });
});

function memoryDb() {
  const leagues = new Map<string, LeagueDefaultsRow>();
  const seasons = new Map<string, unknown | null>();
  const db: DivisionAgeDb = {
    async findLeagueDefaults(organizationId) {
      return leagues.get(organizationId) ?? null;
    },
    async saveLeagueDefaults(input) {
      const row: LeagueDefaultsRow = { ...input, updatedAt: new Date("2026-10-03T18:00:00.000Z") };
      leagues.set(input.organizationId, row);
      return row;
    },
    async findSeasonDivisionAges(organizationId, seasonYear) {
      return seasons.get(`${organizationId}:${seasonYear}`) ?? null;
    },
    async saveSeasonDivisionAges(organizationId, seasonYear, divisionAgesJson) {
      seasons.set(`${organizationId}:${seasonYear}`, divisionAgesJson);
    },
  };
  return { db };
}
