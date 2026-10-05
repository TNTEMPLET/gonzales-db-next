import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { springDivisionAgesLockKey } from "@/lib/ageDivisions/persistence";
import { deriveSportsConnectRowKey } from "@/lib/sportsConnect/enrollmentRowKey";
import { assertImportRunSummaryPatch } from "@/lib/sportsConnect/splitBatchSummary";
import { springEnrollmentLockKey } from "@/lib/sportsConnect/springEnrollmentLock";
import {
  classifyRegistrationHistory,
  RegistrationHistoryError,
  type ExistingHistoryKey,
  type HistoryMappingEntry,
} from "@/lib/sportsConnect/registrationHistory";
import {
  commitRegistrationHistory,
  countRegistrationHistoryUndo,
  storeRegistrationHistoryPreview,
  undoRegistrationHistory,
  type HistoryDb,
  type HistoryRunRow,
} from "@/lib/sportsConnect/registrationHistoryCommit";

const SPRING = "2027 Combined Spring Season";
const FALL = "AP Baseball - Fall 2026";
const SUMMER = "2027 Summer Clinic";
const GONZALES = "2026 Gonzales DYB Spring Season";
const ASCENSION = "2026 Ascension Little League Spring Season";
const FILE_NAME = "spring-split.xlsx";
const FILE_SHA = "c".repeat(64);

type FixtureRow = Record<string, unknown>;

function player(input: {
  program?: string;
  division: string;
  order: string;
  first: string;
  last: string;
  status?: string;
  amount?: string;
  paid?: string;
  balance?: string;
}): FixtureRow {
  return {
    "Program Name": input.program ?? SPRING,
    "Division Name": input.division,
    "Order Payment Status": input.status ?? "Completed",
    "Player First Name": input.first,
    "Player Last Name": input.last,
    "Order No": input.order,
    "Birth Date": "2015-06-15",
    "OrderItem Amount": input.amount ?? "",
    "OrderItem Amount Paid": input.paid ?? "",
    "OrderItem Balance": input.balance ?? "",
  };
}

function splitMapping(
  overrides: Array<{ divisionName: string; organizationId: "gonzales" | "ascension" }> = [],
  programName = SPRING,
): HistoryMappingEntry[] {
  return [
    {
      programName,
      action: "split",
      seasonYear: 2027,
      divisionOverrides: overrides,
    },
  ];
}

type StoredEnrollment = {
  id: string;
  organizationId: string;
  seasonYear: number;
  sportsConnectRowKey: string;
  importRunId: string | null;
  teamId: string | null;
  fullName: string;
};

class MemoryDb {
  runs: HistoryRunRow[] = [];
  enrollments: StoredEnrollment[] = [];
  ops: string[] = [];
  lastKeyRead: Array<{ organizationId: string; seasonYear: number }> = [];
  private seq = 0;

  async $executeRaw(strings: TemplateStringsArray): Promise<number> {
    const sql = strings.join("");
    this.ops.push(sql.includes("pg_advisory_xact_lock") ? "lock" : "executeRaw");
    return 0;
  }

  sportsConnectImportRun = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      this.runs.find((run) => matches(run, where)) ?? null,
    findMany: async ({
      where,
    }: {
      where: { summary: { path: ["splitBatchId"]; equals: string } };
    }) => {
      this.ops.push("run.findMany");
      const batchId = where.summary.equals;
      return this.runs.filter((run) => {
        const summary = run.summary as { splitBatchId?: unknown } | null;
        return !!summary && summary.splitBatchId === batchId;
      });
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; reportKind: string; status: string };
      data: Record<string, unknown>;
    }) => {
      let count = 0;
      for (const run of this.runs) {
        if (!matches(run, where)) continue;
        Object.assign(run, data);
        count += 1;
      }
      return { count };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: `run-${++this.seq}`,
        organizationId: String(data.organizationId),
        seasonYear: Number(data.seasonYear),
        reportKind: String(data.reportKind),
        status: String(data.status),
        summary: data.summary,
        sourceFileName: typeof data.sourceFileName === "string" ? data.sourceFileName : null,
      } satisfies HistoryRunRow;
      this.runs.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = this.runs.find((run) => run.id === where.id);
      if (!row) throw new Error("missing run");
      Object.assign(row, data);
      return row;
    },
  };

  enrollment = {
    findMany: async ({
      where,
    }: {
      where: { OR: Array<{ organizationId: string; seasonYear: number }> };
    }) => {
      this.ops.push("enrollment.findMany");
      this.lastKeyRead = where.OR;
      return this.enrollments
        .filter((row) =>
          where.OR.some(
            (target) =>
              row.organizationId === target.organizationId && row.seasonYear === target.seasonYear,
          ),
        )
        .map((row) => ({
          organizationId: row.organizationId,
          seasonYear: row.seasonYear,
          sportsConnectRowKey: row.sportsConnectRowKey,
        }));
    },
    createMany: async ({
      data,
      skipDuplicates,
    }: {
      data: Array<Record<string, unknown>>;
      skipDuplicates: true;
    }) => {
      assert.equal(skipDuplicates, true);
      let count = 0;
      for (const row of data) {
        assert.equal(row.teamId, null);
        assert.notEqual(row.organizationId, "spring");
        const key = `${row.organizationId}\0${row.seasonYear}\0${row.sportsConnectRowKey}`;
        if (this.enrollments.some((existing) => enrollmentKey(existing) === key)) continue;
        this.enrollments.push({
          id: `enr-${++this.seq}`,
          organizationId: String(row.organizationId),
          seasonYear: Number(row.seasonYear),
          sportsConnectRowKey: String(row.sportsConnectRowKey),
          importRunId: typeof row.importRunId === "string" ? row.importRunId : null,
          teamId: null,
          fullName: String(row.fullName),
        });
        count += 1;
      }
      return { count };
    },
    count: async ({ where }: { where: { importRunId: string } }) => {
      this.ops.push("enrollment.count");
      return this.enrollments.filter((row) => row.importRunId === where.importRunId).length;
    },
    deleteMany: async ({ where }: { where: { importRunId: string } }) => {
      this.ops.push("enrollment.deleteMany");
      const before = this.enrollments.length;
      this.enrollments = this.enrollments.filter((row) => row.importRunId !== where.importRunId);
      return { count: before - this.enrollments.length };
    },
  };

  async $transaction<T>(fn: (tx: MemoryDb) => Promise<T>): Promise<T> {
    const runs = structuredClone(this.runs);
    const enrollments = structuredClone(this.enrollments);
    const seq = this.seq;
    try {
      return await fn(this);
    } catch (err) {
      this.runs = runs;
      this.enrollments = enrollments;
      this.seq = seq;
      throw err;
    }
  }
}

function matches(row: HistoryRunRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(
    ([key, value]) => (row as unknown as Record<string, unknown>)[key] === value,
  );
}

function enrollmentKey(row: StoredEnrollment): string {
  return `${row.organizationId}\0${row.seasonYear}\0${row.sportsConnectRowKey}`;
}

function asDb(db: MemoryDb): HistoryDb {
  return db as unknown as HistoryDb;
}

function rowKey(order: string, first: string, last: string): string {
  return deriveSportsConnectRowKey(order, `${first} ${last}`, new Date("2015-06-15T00:00:00.000Z"));
}

describe("split dry run", () => {
  const rows = [
    player({ division: "12U DYB", order: "S100", first: "Player", last: "North", amount: "100.00", paid: "40.00", balance: "60.00" }),
    player({ division: "12U-DYB", order: "S101", first: "Player", last: "West", amount: "25.50", paid: "25.50", balance: "0.00" }),
    player({ division: "12U (LLB)", order: "S102", first: "Player", last: "South", amount: "80.00", paid: "80.00", balance: "0" }),
    player({ division: "12U LLB", order: "S103", first: "Player", last: "East", amount: "10.00", paid: "10.00", balance: "0" }),
    player({ division: "12U DYB", order: "S104", first: "Player", last: "Kept", amount: "15.00", paid: "15.00", balance: "0" }),
    player({ division: "Tee Ball", order: "S105", first: "Player", last: "Tee", amount: "5.00" }),
    player({ division: "7U Minors", order: "S106", first: "Player", last: "Seven" }),
    player({ division: "8U Minors", order: "S107", first: "Player", last: "Eight" }),
    player({ division: "7/8 Majors", order: "S108", first: "Player", last: "Majors" }),
    player({ division: "14U", order: "S109", first: "Player", last: "Older", amount: "14.00" }),
    player({ division: "17U", order: "S110", first: "Player", last: "Oldest" }),
    player({ division: "14U LLB", order: "S111", first: "Player", last: "Clash", amount: "9.00" }),
    player({ division: "Tee Ball DYB", order: "S112", first: "Player", last: "Mixed" }),
    player({ division: "10U", order: "S113", first: "Player", last: "Open", amount: "30.00" }),
    player({ division: "12U DYB LLB", order: "S114", first: "Player", last: "Both" }),
    player({ division: "12ULLB", order: "S115", first: "Player", last: "Stuck" }),
    player({ division: "softball", order: "S116", first: "Player", last: "Other" }),
    player({ division: "8U", order: "S117", first: "Player", last: "Cancel", status: "Cancelled" }),
    player({ division: "Umpire Clinic", order: "S118", first: "Player", last: "Official" }),
    player({ division: "12U DYB", order: "S100", first: "Player", last: "North" }),
    player({ division: "12U LLB", order: "S100", first: "Player", last: "North" }),
  ];
  const existing: ExistingHistoryKey[] = [
    { organizationId: "ascension", seasonYear: 2027, sportsConnectRowKey: rowKey("S103", "Player", "East") },
    { organizationId: "ascension", seasonYear: 2027, sportsConnectRowKey: rowKey("S104", "Player", "Kept") },
  ];

  const classified = classifyRegistrationHistory({
    rows,
    mapping: splitMapping(),
    existingKeys: existing,
    fileName: FILE_NAME,
    fileSha256: FILE_SHA,
  });

  it("counts adds, same-league, and other-league rows without guessing", () => {
    const gonzales = classified.preview.leagues.find((league) => league.organizationId === "gonzales");
    const ascension = classified.preview.leagues.find((league) => league.organizationId === "ascension");
    assert.ok(gonzales && ascension);
    assert.equal(gonzales.wouldAdd, 4);
    assert.equal(gonzales.alreadySameLeague, 1);
    assert.equal(gonzales.alreadyOtherLeague, 1);
    assert.equal(gonzales.amountCents, 13950);
    assert.equal(gonzales.amountPaidCents, 6550);
    assert.equal(gonzales.balanceCents, 6000);
    assert.equal(ascension.wouldAdd, 5);
    assert.equal(ascension.alreadySameLeague, 1);
    assert.equal(ascension.alreadyOtherLeague, 1);
    assert.equal(ascension.amountCents, 8500);
    assert.equal(ascension.amountPaidCents, 8000);
    assert.equal(ascension.balanceCents, 0);
    assert.equal(classified.preview.totals.wouldAdd, 9);
    assert.equal(classified.preview.totals.alreadySameLeague, 2);
    assert.equal(classified.preview.totals.alreadyOtherLeague, 2);
    assert.equal(classified.preview.totals.unplaceable, 6);
    assert.equal(classified.preview.totals.skipped.not_completed, 1);
    assert.equal(classified.preview.totals.skipped.umpire, 1);
    assert.deepEqual(
      classified.preview.unplaceable.map((division) => [division.divisionName, division.rowCount, division.reason]),
      [
        ["14U LLB", 1, "conflict"],
        ["Tee Ball DYB", 1, "conflict"],
        ["10U", 1, "untagged"],
        ["12U DYB LLB", 1, "both_tags"],
        ["12ULLB", 1, "untagged"],
        ["softball", 1, "untagged"],
      ],
    );
    assert.equal(
      classified.preview.programs[0]?.divisions.find((division) => division.divisionName === "8U")?.unplaceable,
      0,
    );
  });

  it("keeps the raw division text as the age group and never stores spring", () => {
    const tagged = classified.inserts.find((row) => row.sportsConnectOrderNo === "S102");
    const hyphen = classified.inserts.find((row) => row.sportsConnectOrderNo === "S101");
    assert.equal(tagged?.ageGroup, "12U (LLB)");
    assert.equal(tagged?.organizationId, "ascension");
    assert.equal(hyphen?.ageGroup, "12U-DYB");
    assert.equal(hyphen?.organizationId, "gonzales");
    assert.equal(classified.inserts.some((row) => (row.organizationId as string) === "spring"), false);
    assert.equal(classified.inserts.some((row) => row.sportsConnectOrderNo === "S104"), false);
    assert.equal(classified.inserts.some((row) => row.sportsConnectOrderNo === "S113"), false);
  });
});

describe("split commit, override, and batch undo", () => {
  function baseRows() {
    return [
      player({ division: "12U DYB", order: "N1", first: "Player", last: "North", amount: "10.00", paid: "10.00", balance: "0" }),
      player({ division: "12U DYB", order: "N2", first: "Player", last: "West", amount: "4.00" }),
      player({ division: "12U LLB", order: "N3", first: "Player", last: "South", amount: "20.00" }),
      player({ division: "10U", order: "N4", first: "Player", last: "East", amount: "30.00", paid: "5.00", balance: "25.00" }),
    ];
  }

  function seed(db: MemoryDb) {
    const same: StoredEnrollment = {
      id: "same-league",
      organizationId: "gonzales",
      seasonYear: 2027,
      sportsConnectRowKey: rowKey("N2", "Player", "West"),
      importRunId: "older-gonzales",
      teamId: null,
      fullName: "Already Gonzales",
    };
    const other: StoredEnrollment = {
      id: "other-league",
      organizationId: "gonzales",
      seasonYear: 2027,
      sportsConnectRowKey: rowKey("N3", "Player", "South"),
      importRunId: "older-gonzales",
      teamId: null,
      fullName: "Already Other",
    };
    const untouched: StoredEnrollment = {
      id: "untouched",
      organizationId: "ascension",
      seasonYear: 2027,
      sportsConnectRowKey: "left-alone",
      importRunId: "older-ascension",
      teamId: null,
      fullName: "Left Alone",
    };
    db.enrollments.push(same, other, untouched);
    const existingKeys: ExistingHistoryKey[] = [same, other, untouched].map((row) => ({
      organizationId: row.organizationId,
      seasonYear: row.seasonYear,
      sportsConnectRowKey: row.sportsConnectRowKey,
    }));
    return { same, other, untouched, existingKeys };
  }

  it("blocks commit until every unplaceable division has a league", async () => {
    const db = new MemoryDb();
    const { existingKeys, same, other, untouched } = seed(db);
    const before = structuredClone(db.enrollments);
    const rows = baseRows();
    const open = classifyRegistrationHistory({
      rows,
      mapping: splitMapping(),
      existingKeys,
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    assert.equal(open.preview.unplaceable.length, 1);
    assert.equal(open.preview.leagues.find((league) => league.organizationId === "gonzales")?.amountCents, 1000);
    assert.equal(open.preview.leagues.find((league) => league.organizationId === "ascension")?.amountCents, 0);
    const stored = await storeRegistrationHistoryPreview(asDb(db), {
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
      preview: open.preview,
      normalizedMapping: open.normalizedMapping,
      classificationDigest: open.classificationDigest,
      createdByAdminId: null,
    });
    await assert.rejects(
      () =>
        commitRegistrationHistory(asDb(db), {
          previewRunId: stored.id,
          fileName: FILE_NAME,
          fileSha256: FILE_SHA,
          mapping: splitMapping(),
          rows,
          createdByAdminId: null,
          isMaster: true,
        }),
      (err: unknown) =>
        err instanceof RegistrationHistoryError && /Still waiting: 10U/.test(err.message),
    );
    assert.equal(db.runs.find((run) => run.id === stored.id)?.status, "PREVIEW");
    assert.deepEqual(db.enrollments, before);
    assert.deepEqual(db.enrollments.find((row) => row.id === other.id), other);
    assert.equal(same.organizationId, "gonzales");
    assert.equal(untouched.organizationId, "ascension");

    const mapping = splitMapping([{ divisionName: "10U", organizationId: "ascension" }]);
    const ready = classifyRegistrationHistory({
      rows,
      mapping,
      existingKeys,
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    assert.equal(ready.preview.unplaceable.length, 0);
    const east = ready.inserts.find((row) => row.sportsConnectOrderNo === "N4");
    assert.equal(east?.organizationId, "ascension");
    assert.equal(east?.ageGroup, "10U");
    assert.equal(ready.preview.leagues.find((league) => league.organizationId === "ascension")?.wouldAdd, 1);
    assert.equal(ready.preview.leagues.find((league) => league.organizationId === "ascension")?.amountCents, 3000);
    assert.equal(ready.preview.leagues.find((league) => league.organizationId === "ascension")?.amountPaidCents, 500);
    assert.equal(ready.preview.leagues.find((league) => league.organizationId === "ascension")?.balanceCents, 2500);
    assert.equal(ready.preview.leagues.find((league) => league.organizationId === "gonzales")?.alreadySameLeague, 1);
    assert.equal(ready.preview.leagues.find((league) => league.organizationId === "ascension")?.alreadyOtherLeague, 1);
    assert.equal(ready.inserts.some((row) => row.sportsConnectOrderNo === "N2"), false);
    assert.equal(ready.inserts.some((row) => row.sportsConnectOrderNo === "N3"), false);

    const preview = await storeRegistrationHistoryPreview(asDb(db), {
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
      preview: ready.preview,
      normalizedMapping: ready.normalizedMapping,
      classificationDigest: ready.classificationDigest,
      createdByAdminId: null,
    });
    const committed = await commitRegistrationHistory(asDb(db), {
      previewRunId: preview.id,
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
      mapping,
      rows,
      createdByAdminId: null,
      isMaster: true,
    });
    assert.deepEqual(
      committed.runs.map((run) => run.organizationId),
      ["ascension", "gonzales"],
    );
    const gonzalesRun = committed.runs.find((run) => run.organizationId === "gonzales");
    const ascensionRun = committed.runs.find((run) => run.organizationId === "ascension");
    assert.equal(gonzalesRun?.inserted, 1);
    assert.equal(gonzalesRun?.alreadySameLeague, 1);
    assert.equal(ascensionRun?.inserted, 1);
    assert.equal(ascensionRun?.alreadyOtherLeague, 1);
    const summaries = committed.runs.map((run) => db.runs.find((stored) => stored.id === run.id)?.summary);
    for (const summary of summaries) {
      const record = summary as { splitBatch?: boolean; splitBatchId?: string; splitBatchRunIds?: string[] };
      assert.equal(record.splitBatch, true);
      assert.equal(record.splitBatchId, preview.id);
      assert.deepEqual(record.splitBatchRunIds, [ascensionRun?.id, gonzalesRun?.id]);
    }
    assert.equal(db.enrollments.find((row) => row.id === other.id)?.organizationId, "gonzales");
    assert.equal(db.enrollments.find((row) => row.id === untouched.id)?.importRunId, "older-ascension");

    await assert.rejects(
      () =>
        undoRegistrationHistory(asDb(db), {
          runId: gonzalesRun!.id,
          organizationId: "gonzales",
          isMaster: false,
        }),
      (err: unknown) => err instanceof RegistrationHistoryError && err.status === 403,
    );
    assert.equal(db.runs.find((run) => run.id === gonzalesRun!.id)?.status, "DONE");
    assert.equal(db.runs.find((run) => run.id === ascensionRun!.id)?.status, "DONE");
    assert.equal(db.enrollments.some((row) => row.importRunId === gonzalesRun!.id), true);
    await assert.rejects(
      () =>
        undoRegistrationHistory(asDb(db), {
          runId: ascensionRun!.id,
          organizationId: "ascension",
          isMaster: false,
        }),
      (err: unknown) => err instanceof RegistrationHistoryError && err.status === 403,
    );
    assert.equal(db.enrollments.some((row) => row.importRunId === ascensionRun!.id), true);

    const counted = await countRegistrationHistoryUndo(asDb(db), {
      runId: ascensionRun!.id,
      organizationId: "ascension",
      isMaster: true,
    });
    assert.equal(counted.enrollmentCount, 2);
    assert.equal(counted.splitBatch, true);
    assert.equal(counted.runCount, 2);
    const undone = await undoRegistrationHistory(asDb(db), {
      runId: ascensionRun!.id,
      organizationId: "ascension",
      isMaster: true,
    });
    assert.equal(undone.enrollmentCount, 2);
    assert.equal(undone.runCount, 2);
    assert.equal(db.enrollments.some((row) => row.importRunId === gonzalesRun!.id), false);
    assert.equal(db.enrollments.some((row) => row.importRunId === ascensionRun!.id), false);
    assert.equal(db.runs.find((run) => run.id === gonzalesRun!.id)?.status, "UNDONE");
    assert.equal(db.runs.find((run) => run.id === ascensionRun!.id)?.status, "UNDONE");
    assert.equal(db.enrollments.some((row) => row.id === same.id), true);
    assert.equal(db.enrollments.some((row) => row.id === other.id), true);
    assert.equal(db.enrollments.some((row) => row.id === untouched.id), true);
  });

  it("refuses a non-master split before writing enrollments", async () => {
    const db = new MemoryDb();
    const rows = [
      player({ division: "12U DYB", order: "M1", first: "Player", last: "North" }),
      player({ division: "12U LLB", order: "M2", first: "Player", last: "South" }),
    ];
    const open = classifyRegistrationHistory({
      rows,
      mapping: splitMapping(),
      existingKeys: [],
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    const stored = await storeRegistrationHistoryPreview(asDb(db), {
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
      preview: open.preview,
      normalizedMapping: open.normalizedMapping,
      classificationDigest: open.classificationDigest,
      createdByAdminId: null,
    });
    await assert.rejects(
      () =>
        commitRegistrationHistory(asDb(db), {
          previewRunId: stored.id,
          fileName: FILE_NAME,
          fileSha256: FILE_SHA,
          mapping: splitMapping(),
          rows,
          createdByAdminId: null,
          isMaster: false,
        }),
      (err: unknown) => err instanceof RegistrationHistoryError && err.status === 403,
    );
    assert.equal(db.enrollments.length, 0);
    assert.equal(db.runs.find((run) => run.id === stored.id)?.status, "PREVIEW");
  });
});

describe("split guards", () => {
  it("refuses to split a Fall program", () => {
    assert.throws(
      () =>
        classifyRegistrationHistory({
          rows: [player({ program: FALL, division: "12U LLB", order: "F1", first: "Player", last: "Fall" })],
          mapping: splitMapping([], FALL),
          existingKeys: [],
          fileName: FILE_NAME,
          fileSha256: FILE_SHA,
        }),
      (err: unknown) =>
        err instanceof RegistrationHistoryError && /can't be split/.test(err.message),
    );
  });

  it("refuses to split a program that is not Spring", () => {
    assert.throws(
      () =>
        classifyRegistrationHistory({
          rows: [player({ program: SUMMER, division: "12U DYB", order: "U1", first: "Player", last: "Summer" })],
          mapping: [{ programName: SUMMER, action: "split", seasonYear: 2027 }],
          existingKeys: [],
          fileName: FILE_NAME,
          fileSha256: FILE_SHA,
        }),
      (err: unknown) =>
        err instanceof RegistrationHistoryError && /only for a Spring program/.test(err.message),
    );
  });

  it("refuses a division league that is not Gonzales or Ascension", () => {
    assert.throws(
      () =>
        classifyRegistrationHistory({
          rows: [player({ division: "10U", order: "O1", first: "Player", last: "Open" })],
          mapping: [
            {
              programName: SPRING,
              action: "split",
              seasonYear: 2027,
              divisionOverrides: [{ divisionName: "10U", organizationId: "spring" }],
            },
          ],
          existingKeys: [],
          fileName: FILE_NAME,
          fileSha256: FILE_SHA,
        }),
      (err: unknown) =>
        err instanceof RegistrationHistoryError && /Gonzales DYB or Ascension LL/.test(err.message),
    );
  });

  it("still adds a single-league row that already exists only in the other league", () => {
    const rows = [
      player({
        program: GONZALES,
        division: "8U",
        order: "G1",
        first: "Player",
        last: "Only",
      }),
    ];
    const mapping: HistoryMappingEntry[] = [
      { programName: GONZALES, action: "map", organizationId: "gonzales", seasonYear: 2026 },
    ];
    const existing: ExistingHistoryKey[] = [
      {
        organizationId: "ascension",
        seasonYear: 2026,
        sportsConnectRowKey: rowKey("G1", "Player", "Only"),
      },
    ];
    const classified = classifyRegistrationHistory({
      rows,
      mapping,
      existingKeys: existing,
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    assert.equal(classified.preview.totals.wouldAdd, 1);
    assert.equal(classified.preview.totals.alreadyPresent, 0);
    assert.equal(classified.inserts[0]?.organizationId, "gonzales");
    assert.equal(classified.preview.leagues.length, 0);
  });

  it("does not link a two-program import for batch undo", async () => {
    const rows = [
      player({ program: GONZALES, division: "8U", order: "T1", first: "Player", last: "One" }),
      player({ program: ASCENSION, division: "Tee Ball", order: "T2", first: "Player", last: "Two" }),
    ];
    const mapping: HistoryMappingEntry[] = [
      { programName: GONZALES, action: "map", organizationId: "gonzales", seasonYear: 2026 },
      { programName: ASCENSION, action: "map", organizationId: "ascension", seasonYear: 2026 },
    ];
    const open = classifyRegistrationHistory({
      rows,
      mapping,
      existingKeys: [],
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    const db = new MemoryDb();
    const stored = await storeRegistrationHistoryPreview(asDb(db), {
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
      preview: open.preview,
      normalizedMapping: open.normalizedMapping,
      classificationDigest: open.classificationDigest,
      createdByAdminId: null,
    });
    const result = await commitRegistrationHistory(asDb(db), {
      previewRunId: stored.id,
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
      mapping,
      rows,
      createdByAdminId: null,
    });
    assert.equal(result.runs.length, 2);
    for (const run of result.runs) {
      const summary = db.runs.find((storedRun) => storedRun.id === run.id)?.summary as {
        splitBatch?: boolean;
      };
      assert.equal(summary.splitBatch, undefined);
    }
    const gonzales = result.runs.find((run) => run.organizationId === "gonzales");
    assert.ok(gonzales);
    await undoRegistrationHistory(asDb(db), {
      runId: gonzales.id,
      organizationId: "gonzales",
    });
    const ascension = result.runs.find((run) => run.organizationId === "ascension");
    assert.equal(db.runs.find((run) => run.id === ascension?.id)?.status, "DONE");
    assert.equal(db.enrollments.some((row) => row.importRunId === ascension?.id), true);
    assert.equal(db.enrollments.some((row) => row.importRunId === gonzales.id), false);
  });

  it("wires split imports to the master flag", () => {
    const route = readFileSync(
      new URL("../../../app/api/admin/sports-connect/registration-history/route.ts", import.meta.url),
      "utf8",
    );
    const commit = readFileSync(
      new URL("../registrationHistoryCommit.ts", import.meta.url),
      "utf8",
    );
    assert.match(route, /splitImportDenial\(isMaster, mapping\)/);
    assert.match(route, /auth\.admin\.isMaster/);
    assert.match(commit, /splitBatchRunIds/);
    const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
    assert.doesNotMatch(schema, /splitBatch/);
  });
});

const CHANGED = "The registrations changed since the preview. Run the preview again.";

function assertLockBefore(ops: string[], read: string) {
  const lockAt = ops.indexOf("lock");
  const readAt = ops.indexOf(read);
  assert.ok(lockAt >= 0);
  assert.ok(readAt >= 0);
  assert.ok(lockAt < readAt);
}

async function previewAndCommit(
  db: MemoryDb,
  rows: FixtureRow[],
  mapping: HistoryMappingEntry[],
  existingKeys: ExistingHistoryKey[],
) {
  const open = classifyRegistrationHistory({
    rows,
    mapping,
    existingKeys,
    fileName: FILE_NAME,
    fileSha256: FILE_SHA,
  });
  const stored = await storeRegistrationHistoryPreview(asDb(db), {
    fileName: FILE_NAME,
    fileSha256: FILE_SHA,
    preview: open.preview,
    normalizedMapping: open.normalizedMapping,
    classificationDigest: open.classificationDigest,
    createdByAdminId: null,
  });
  const committed = await commitRegistrationHistory(asDb(db), {
    previewRunId: stored.id,
    fileName: FILE_NAME,
    fileSha256: FILE_SHA,
    mapping,
    rows,
    createdByAdminId: null,
    isMaster: true,
  });
  return { open, stored, committed };
}

describe("split review fixes", () => {
  it("rejects a split commit mixed with another program mapping", () => {
    const rows = [
      player({ division: "12U DYB", order: "X1", first: "Player", last: "North" }),
      player({ program: GONZALES, division: "8U", order: "X2", first: "Player", last: "One" }),
    ];
    const mapping: HistoryMappingEntry[] = [
      ...splitMapping(),
      { programName: GONZALES, action: "map", organizationId: "gonzales", seasonYear: 2026 },
    ];
    assert.throws(
      () =>
        classifyRegistrationHistory({
          rows,
          mapping,
          existingKeys: [],
          fileName: FILE_NAME,
          fileSha256: FILE_SHA,
        }),
      (err: unknown) =>
        err instanceof RegistrationHistoryError && /one Spring program/.test(err.message),
    );
    assert.throws(
      () =>
        classifyRegistrationHistory({
          rows,
          mapping: [
            { programName: SPRING, action: "split", seasonYear: 2027 },
            { programName: GONZALES, action: "split", seasonYear: 2026 },
          ],
          existingKeys: [],
          fileName: FILE_NAME,
          fileSha256: FILE_SHA,
        }),
      (err: unknown) =>
        err instanceof RegistrationHistoryError && /one Spring program/.test(err.message),
    );
  });

  it("refuses undo when a forged summary shares a batch id with a Fall run", async () => {
    const db = new MemoryDb();
    const rows = [
      player({ division: "12U DYB", order: "F10", first: "Player", last: "North" }),
      player({ division: "12U LLB", order: "F11", first: "Player", last: "South" }),
    ];
    const { committed } = await previewAndCommit(db, rows, splitMapping(), []);
    const gonzales = committed.runs.find((run) => run.organizationId === "gonzales");
    const ascension = committed.runs.find((run) => run.organizationId === "ascension");
    assert.ok(gonzales && ascension);
    const batchId = (db.runs.find((run) => run.id === gonzales.id)?.summary as { splitBatchId: string })
      .splitBatchId;
    const reportKind = db.runs.find((run) => run.id === gonzales.id)?.reportKind ?? "";
    db.runs.push({
      id: "fall-run",
      organizationId: "fallball",
      seasonYear: 2026,
      reportKind,
      status: "DONE",
      sourceFileName: "fall.xlsx",
      summary: {
        role: "commit",
        source: "split",
        programName: FALL,
        splitBatch: true,
        splitBatchId: batchId,
        splitBatchRunIds: [gonzales.id, "fall-run"],
      },
    });
    db.enrollments.push({
      id: "fall-row",
      organizationId: "fallball",
      seasonYear: 2026,
      sportsConnectRowKey: "fall-key",
      importRunId: "fall-run",
      teamId: null,
      fullName: "Player Fall",
    });
    const gonzalesSummary = db.runs.find((run) => run.id === gonzales.id)?.summary as {
      splitBatchRunIds: string[];
    };
    gonzalesSummary.splitBatchRunIds = [gonzales.id, "fall-run"];
    const before = db.enrollments.map((row) => row.id).sort();
    await assert.rejects(
      () =>
        undoRegistrationHistory(asDb(db), {
          runId: gonzales.id,
          organizationId: "gonzales",
          isMaster: true,
        }),
      (err: unknown) =>
        err instanceof RegistrationHistoryError &&
        err.status === 409 &&
        /Nothing was removed/.test(err.message),
    );
    assert.deepEqual(db.enrollments.map((row) => row.id).sort(), before);
    assert.equal(db.runs.find((run) => run.id === gonzales.id)?.status, "DONE");
    assert.equal(db.runs.find((run) => run.id === ascension.id)?.status, "DONE");
    assert.equal(db.runs.find((run) => run.id === "fall-run")?.status, "DONE");
  });

  it("undo from either league removes both runs and ignores a forged id list", async () => {
    const db = new MemoryDb();
    const rows = [
      player({ division: "12U DYB", order: "E1", first: "Player", last: "North" }),
      player({ division: "12U LLB", order: "E2", first: "Player", last: "South" }),
    ];
    const { committed } = await previewAndCommit(db, rows, splitMapping(), []);
    const gonzales = committed.runs.find((run) => run.organizationId === "gonzales");
    const ascension = committed.runs.find((run) => run.organizationId === "ascension");
    assert.ok(gonzales && ascension);
    db.runs.push({
      id: "fall-run",
      organizationId: "fallball",
      seasonYear: 2026,
      reportKind: db.runs[0]?.reportKind ?? "",
      status: "DONE",
      sourceFileName: "fall.xlsx",
      summary: { role: "commit", source: "map", programName: FALL, programNames: [FALL] },
    });
    db.enrollments.push({
      id: "fall-row",
      organizationId: "fallball",
      seasonYear: 2026,
      sportsConnectRowKey: "fall-key",
      importRunId: "fall-run",
      teamId: null,
      fullName: "Player Fall",
    });
    const summary = db.runs.find((run) => run.id === gonzales.id)?.summary as { splitBatchRunIds: string[] };
    summary.splitBatchRunIds = [gonzales.id, "fall-run"];
    db.ops = [];
    const undone = await undoRegistrationHistory(asDb(db), {
      runId: gonzales.id,
      organizationId: "gonzales",
      isMaster: true,
    });
    assert.equal(undone.runCount, 2);
    assert.equal(db.runs.find((run) => run.id === gonzales.id)?.status, "UNDONE");
    assert.equal(db.runs.find((run) => run.id === ascension.id)?.status, "UNDONE");
    assert.equal(db.runs.find((run) => run.id === "fall-run")?.status, "DONE");
    assert.equal(db.enrollments.some((row) => row.importRunId === "fall-run"), true);
    assert.equal(db.enrollments.some((row) => row.importRunId === gonzales.id), false);
    assert.equal(db.enrollments.some((row) => row.importRunId === ascension.id), false);
    assertLockBefore(db.ops, "enrollment.count");
    assertLockBefore(db.ops, "enrollment.deleteMany");
  });

  it("refuses to strip or add split summary fields", () => {
    const splitSummary = {
      role: "commit",
      source: "split",
      splitBatch: true,
      splitBatchId: "preview-1",
      splitBatchRunIds: ["run-a", "run-b"],
      programName: SPRING,
    };
    assert.throws(
      () => assertImportRunSummaryPatch(splitSummary, { role: "commit", source: "map" }),
      (err: unknown) => err instanceof Error && /cannot be changed/.test(err.message),
    );
    assert.throws(
      () => assertImportRunSummaryPatch(splitSummary, null),
      (err: unknown) => err instanceof Error && /cannot be changed/.test(err.message),
    );
    assert.throws(
      () =>
        assertImportRunSummaryPatch(
          { role: "commit", source: "map" },
          { role: "commit", splitBatch: true, splitBatchId: "preview-1", splitBatchRunIds: ["run-a"] },
        ),
      (err: unknown) => err instanceof Error && /cannot be added/.test(err.message),
    );
    assert.throws(
      () => assertImportRunSummaryPatch({ role: "commit" }, { splitBatchId: "preview-1" }),
      (err: unknown) => err instanceof Error && /cannot be added/.test(err.message),
    );
    assert.doesNotThrow(() => assertImportRunSummaryPatch(splitSummary, undefined));
    assert.doesNotThrow(() =>
      assertImportRunSummaryPatch({ role: "commit", source: "map" }, { role: "commit", source: "map" }),
    );
    const runsRoute = readFileSync(
      new URL("../../../app/api/admin/sports-connect/runs/[id]/route.ts", import.meta.url),
      "utf8",
    );
    const importRuns = readFileSync(new URL("../importRuns.ts", import.meta.url), "utf8");
    assert.match(importRuns, /assertImportRunSummaryPatch\(/);
    assert.match(runsRoute, /ImportRunSummaryError/);
  });

  it("returns 409 when the same counts describe swapped rows", async () => {
    const db = new MemoryDb();
    const rows = [
      player({ division: "12U DYB", order: "A1", first: "Player", last: "Alpha" }),
      player({ division: "14U", order: "B1", first: "Player", last: "Beta" }),
    ];
    const keyA = rowKey("A1", "Player", "Alpha");
    const keyB = rowKey("B1", "Player", "Beta");
    db.enrollments.push({
      id: "pre-a",
      organizationId: "gonzales",
      seasonYear: 2027,
      sportsConnectRowKey: keyA,
      importRunId: "older",
      teamId: null,
      fullName: "Player Alpha",
    });
    const existingA: ExistingHistoryKey[] = [
      { organizationId: "gonzales", seasonYear: 2027, sportsConnectRowKey: keyA },
    ];
    const existingB: ExistingHistoryKey[] = [
      { organizationId: "gonzales", seasonYear: 2027, sportsConnectRowKey: keyB },
    ];
    const first = classifyRegistrationHistory({
      rows,
      mapping: splitMapping(),
      existingKeys: existingA,
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    const swapped = classifyRegistrationHistory({
      rows,
      mapping: splitMapping(),
      existingKeys: existingB,
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    assert.equal(first.preview.totals.wouldAdd, swapped.preview.totals.wouldAdd);
    assert.equal(first.preview.totals.alreadySameLeague, swapped.preview.totals.alreadySameLeague);
    assert.notEqual(first.classificationDigest, swapped.classificationDigest);
    const stored = await storeRegistrationHistoryPreview(asDb(db), {
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
      preview: first.preview,
      normalizedMapping: first.normalizedMapping,
      classificationDigest: first.classificationDigest,
      createdByAdminId: null,
    });
    db.enrollments = [
      {
        id: "pre-b",
        organizationId: "gonzales",
        seasonYear: 2027,
        sportsConnectRowKey: keyB,
        importRunId: "older",
        teamId: null,
        fullName: "Player Beta",
      },
    ];
    const before = structuredClone(db.enrollments);
    const runCount = db.runs.length;
    await assert.rejects(
      () =>
        commitRegistrationHistory(asDb(db), {
          previewRunId: stored.id,
          fileName: FILE_NAME,
          fileSha256: FILE_SHA,
          mapping: splitMapping(),
          rows,
          createdByAdminId: null,
          isMaster: true,
        }),
      (err: unknown) =>
        err instanceof RegistrationHistoryError && err.status === 409 && err.message === CHANGED,
    );
    assert.equal(db.runs.find((run) => run.id === stored.id)?.status, "PREVIEW");
    assert.equal(db.runs.length, runCount);
    assert.deepEqual(db.enrollments, before);
  });

  it("takes the spring enrollment lock before key reads and leaves Fall unlocked", async () => {
    const splitDb = new MemoryDb();
    const splitRows = [
      player({ division: "12U DYB", order: "L1", first: "Player", last: "North" }),
      player({ division: "12U LLB", order: "L2", first: "Player", last: "South" }),
    ];
    splitDb.ops = [];
    const split = await previewAndCommit(splitDb, splitRows, splitMapping(), []);
    assertLockBefore(splitDb.ops, "enrollment.findMany");
    assert.deepEqual(
      splitDb.lastKeyRead.map((target) => target.organizationId).sort(),
      ["ascension", "gonzales"],
    );
    const gonzales = split.committed.runs.find((run) => run.organizationId === "gonzales");
    assert.ok(gonzales);

    const springDb = new MemoryDb();
    const springRows = [
      player({ program: GONZALES, division: "8U", order: "G9", first: "Player", last: "Only" }),
    ];
    const springMapping: HistoryMappingEntry[] = [
      { programName: GONZALES, action: "map", organizationId: "gonzales", seasonYear: 2026 },
    ];
    springDb.enrollments.push({
      id: "other-league",
      organizationId: "ascension",
      seasonYear: 2026,
      sportsConnectRowKey: rowKey("G9", "Player", "Only"),
      importRunId: "older",
      teamId: null,
      fullName: "Player Only",
    });
    springDb.ops = [];
    const spring = await previewAndCommit(springDb, springRows, springMapping, [
      {
        organizationId: "ascension",
        seasonYear: 2026,
        sportsConnectRowKey: rowKey("G9", "Player", "Only"),
      },
    ]);
    assert.equal(spring.committed.runs[0]?.inserted, 1);
    assertLockBefore(springDb.ops, "enrollment.findMany");
    assert.deepEqual(
      springDb.lastKeyRead.map((target) => target.organizationId).sort(),
      ["ascension", "gonzales"],
    );
    springDb.ops = [];
    await undoRegistrationHistory(asDb(springDb), {
      runId: spring.committed.runs[0]!.id,
      organizationId: "gonzales",
    });
    assertLockBefore(springDb.ops, "enrollment.deleteMany");
    assert.equal(springDb.enrollments.some((row) => row.id === "other-league"), true);

    const fallDb = new MemoryDb();
    const rec = "2026 Rec Season";
    const fallRows = [player({ program: rec, division: "8U", order: "R1", first: "Player", last: "Rec" })];
    const fallMapping: HistoryMappingEntry[] = [
      { programName: rec, action: "map", organizationId: "fallball", seasonYear: 2026 },
    ];
    fallDb.ops = [];
    const fall = await previewAndCommit(fallDb, fallRows, fallMapping, []);
    assert.equal(fallDb.ops.includes("lock"), false);
    assert.ok(fallDb.ops.includes("enrollment.findMany"));
    assert.deepEqual(
      fallDb.lastKeyRead.map((target) => target.organizationId),
      ["fallball"],
    );
    fallDb.ops = [];
    await undoRegistrationHistory(asDb(fallDb), {
      runId: fall.committed.runs[0]!.id,
      organizationId: "fallball",
    });
    assert.equal(fallDb.ops.includes("lock"), false);
    assert.ok(fallDb.ops.includes("enrollment.deleteMany"));

    const teams = readFileSync(
      new URL("../../../app/api/admin/teams/import/route.ts", import.meta.url),
      "utf8",
    );
    const lockAt = teams.indexOf("await lockSpringEnrollment(tx, seasonYear);");
    const readAt = teams.indexOf("await tx.enrollment.findMany");
    const fallUpsert = teams.lastIndexOf("await prisma.enrollment.upsert");
    assert.ok(lockAt > 0 && readAt > lockAt);
    assert.ok(fallUpsert > readAt);
    assert.match(teams, /targetOrg === "gonzales" \|\| targetOrg === "ascension"/);
    const lockSource = readFileSync(new URL("../springEnrollmentLock.ts", import.meta.url), "utf8");
    assert.match(lockSource, /spring-enrollment:/);
    assert.match(lockSource, /pg_advisory_xact_lock/);
    assert.equal(lockSource.includes("spring-division-ages"), false);
    assert.notEqual(springEnrollmentLockKey(2027), springDivisionAgesLockKey(2027));
    assert.notEqual(springEnrollmentLockKey(2026), springEnrollmentLockKey(2027));
  });
});
