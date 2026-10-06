import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";

import { excludeRegistrationHistoryEnrollment } from "@/lib/enrollment/operationalEnrollment";
import { planStaleEnrollmentPrune } from "@/lib/sportsConnect/prunePlan";
import {
  classifyRegistrationHistory,
  EXCLUDED_RAW_ROW_COLUMN_NAMES,
  isExcludedRawColumn,
  previewContainsRowPii,
  readRegistrationHistoryExport,
  RegistrationHistoryError,
  suggestProgramMapping,
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

const GONZALES = "2026 Gonzales DYB Spring Season";
const ASCENSION = "2026 Ascension Little League Spring Season";
const FALL = "AP Baseball - Fall 2026";
const SUMMER = "2026 Summer Clinic";

const ALLERGY = "Are there any physical / medical conditions or allergies that the staff need to be aware of?";
const FILE_NAME = "spring-history.xlsx";
const FILE_SHA = "a".repeat(64);

type FixtureRow = Record<string, unknown>;

function row(input: {
  program: string;
  division: string;
  status: string;
  first?: string;
  last?: string;
  order?: string;
  birth?: string;
  extra?: Record<string, unknown>;
}): FixtureRow {
  return {
    "Program Name": input.program,
    "Division Name": input.division,
    "Order Payment Status": input.status,
    "Player First Name": input.first ?? "",
    "Player Last Name": input.last ?? "",
    "Order No": input.order ?? "",
    "Birth Date": input.birth ?? "",
    "Player Gender": "F",
    City: "Sample City",
    "Postal Code": "70000",
    ...input.extra,
  };
}

function springFixture(): FixtureRow[] {
  const contact = {
    "User Email": "guardian@example.invalid",
    "Cell Phone": "2255550199",
    "Street Address": "10 Oak Street",
    "Insurance Company": "Sample Mutual",
    "Policy Number": "POL-1",
    "Physician Phone": "2255550101",
    [ALLERGY]: "peanut allergy note",
  };
  return [
    row({ program: GONZALES, division: "8U", status: "Completed", first: "Player", last: "One", order: "1001", birth: "2016-04-02", extra: contact }),
    row({ program: GONZALES, division: "8U", status: "Completed", first: "Player", last: "Two", order: "1002", birth: "2016-05-03" }),
    row({ program: GONZALES, division: "8U", status: " completed ", first: "Player", last: "Three", order: "1003", birth: "2016-06-04" }),
    row({ program: GONZALES, division: "8U", status: "Completed", first: "Player", last: "One", order: "1001", birth: "2016-04-02" }),
    row({ program: GONZALES, division: "8U", status: "Cancelled", first: "Player", last: "Four", order: "1004", birth: "2016-07-05" }),
    row({ program: GONZALES, division: "8U", status: "Failed", first: "Player", last: "Five", order: "1005", birth: "2016-08-06" }),
    row({ program: GONZALES, division: "8U", status: "", first: "Player", last: "Six", order: "1006", birth: "2016-09-07" }),
    row({ program: GONZALES, division: "8U", status: "Completed", first: "Player", last: "Seven", order: "1007", birth: "" }),
    row({ program: GONZALES, division: "8U", status: "Completed", order: "1008", birth: "2016-01-01" }),
    row({ program: ASCENSION, division: "Tee Ball", status: "Completed", first: "Player", last: "Eight", order: "2001", birth: "2018-02-02" }),
    row({ program: ASCENSION, division: "Tee Ball", status: "Completed", first: "Player", last: "Nine", order: "2002", birth: "2018-03-03" }),
    row({ program: ASCENSION, division: "Umpire Clinic", status: "Completed", first: "Player", last: "Ten", order: "2003", birth: "1990-01-01" }),
    row({ program: ASCENSION, division: "Volunteer Umpire", status: "Completed", first: "Player", last: "Eleven", order: "2004", birth: "1991-02-02" }),
    row({ program: ASCENSION, division: "Tee Ball", status: "Cancelled", first: "Player", last: "Twelve", order: "2005", birth: "2018-04-04" }),
    row({ program: ASCENSION, division: "Tee Ball", status: "Failed", first: "Player", last: "Thirteen", order: "2006", birth: "2018-05-05" }),
    row({ program: ASCENSION, division: "Umpire Clinic", status: "Cancelled", first: "Player", last: "Fourteen", order: "2007", birth: "1992-03-03" }),
    row({ program: FALL, division: "8U", status: "Completed", first: "Player", last: "Fifteen", order: "3001", birth: "2016-04-02" }),
    row({ program: FALL, division: "8U", status: "Cancelled", first: "Player", last: "Sixteen", order: "3002", birth: "2016-05-03" }),
    row({ program: FALL, division: "8U", status: "Failed", first: "Player", last: "Seventeen", order: "3003", birth: "2016-06-04" }),
    row({ program: SUMMER, division: "8U", status: "Completed", first: "Player", last: "Eighteen", order: "4001", birth: "2016-07-07" }),
  ];
}

function suggestedMapping(rows: readonly FixtureRow[]): HistoryMappingEntry[] {
  const names: string[] = [];
  for (const entry of rows) {
    const name = String(entry["Program Name"] || "");
    if (!names.includes(name)) names.push(name);
  }
  return names.map((programName) => {
    const suggestion = suggestProgramMapping(programName);
    if (suggestion.action !== "map" || !suggestion.organizationId || !suggestion.seasonYear) {
      return { programName, action: "skip" };
    }
    return {
      programName,
      action: "map",
      organizationId: suggestion.organizationId,
      seasonYear: suggestion.seasonYear,
    };
  });
}

const PII_NEEDLES = [
  "Player One",
  "guardian@example.invalid",
  "2255550199",
  "10 Oak Street",
  "2016-04-02",
  "peanut allergy note",
  "Sample Mutual",
  "POL-1",
];

type StoredEnrollment = {
  id: string;
  organizationId: string;
  seasonYear: number;
  sportsConnectRowKey: string;
  importRunId: string | null;
  teamId: string | null;
  fullName: string;
  rawRow?: Record<string, unknown>;
};

class MemoryDb {
  runs: HistoryRunRow[] = [];
  enrollments: StoredEnrollment[] = [];
  calls: string[] = [];
  private seq = 0;

  sportsConnectImportRun = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      return this.runs.find((run) => matches(run, where)) ?? null;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; reportKind: string; status: string };
      data: Record<string, unknown>;
    }) => {
      this.calls.push("sportsConnectImportRun.updateMany");
      let count = 0;
      for (const run of this.runs) {
        if (!matches(run, where)) continue;
        Object.assign(run, data);
        count += 1;
      }
      return { count };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.calls.push("sportsConnectImportRun.create");
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
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      this.calls.push("sportsConnectImportRun.update");
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
      this.calls.push("enrollment.findMany");
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
      this.calls.push("enrollment.createMany");
      assert.equal(skipDuplicates, true);
      let count = 0;
      for (const row of data) {
        assert.equal(row.teamId, null);
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
          rawRow: (row.rawRow as Record<string, unknown>) ?? {},
        });
        count += 1;
      }
      return { count };
    },
    update: async () => {
      this.calls.push("enrollment.update");
      throw new Error("enrollment update");
    },
    upsert: async () => {
      this.calls.push("enrollment.upsert");
      throw new Error("enrollment upsert");
    },
    delete: async () => {
      this.calls.push("enrollment.delete");
      throw new Error("enrollment delete");
    },
    count: async ({ where }: { where: { importRunId: string } }) =>
      this.enrollments.filter((row) => row.importRunId === where.importRunId).length,
    deleteMany: async ({ where }: { where: { importRunId: string } }) => {
      this.calls.push("enrollment.deleteMany");
      const before = this.enrollments.length;
      this.enrollments = this.enrollments.filter((row) => row.importRunId !== where.importRunId);
      return { count: before - this.enrollments.length };
    },
  };

  team = this.forbidden("team");
  teamPlayer = this.forbidden("teamPlayer");

  async $executeRaw(strings: TemplateStringsArray): Promise<number> {
    const sql = strings.join("");
    this.calls.push(sql.includes("pg_advisory_xact_lock") ? "lock" : "executeRaw");
    return 0;
  }

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

  private forbidden(name: string) {
    const calls = this.calls;
    return new Proxy(
      {},
      {
        get(_target, prop) {
          return () => {
            calls.push(`${name}.${String(prop)}`);
            throw new Error(`${name}.${String(prop)}`);
          };
        },
      },
    );
  }
}

function matches(row: HistoryRunRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value);
}

function enrollmentKey(row: StoredEnrollment): string {
  return `${row.organizationId}\0${row.seasonYear}\0${row.sportsConnectRowKey}`;
}

function asDb(db: MemoryDb): HistoryDb {
  return db as unknown as HistoryDb;
}

describe("registration history mapping", () => {
  it("suggests Gonzales and Ascension and locks Fall", () => {
    assert.deepEqual(suggestProgramMapping(GONZALES), {
      action: "map",
      organizationId: "gonzales",
      seasonYear: 2026,
      fallLocked: false,
    });
    assert.deepEqual(suggestProgramMapping(ASCENSION), {
      action: "map",
      organizationId: "ascension",
      seasonYear: 2026,
      fallLocked: false,
    });
    assert.deepEqual(suggestProgramMapping(FALL), {
      action: "skip",
      organizationId: null,
      seasonYear: null,
      fallLocked: true,
    });
    assert.equal(suggestProgramMapping(SUMMER).action, "skip");
    assert.equal(suggestProgramMapping(SUMMER).fallLocked, false);
  });

  it("refuses to map a Fall program", () => {
    assert.throws(
      () =>
        classifyRegistrationHistory({
          rows: springFixture().filter((entry) => entry["Program Name"] === FALL),
          mapping: [{ programName: FALL, action: "map", organizationId: "fallball", seasonYear: 2026 }],
          existingKeys: [],
          fileName: FILE_NAME,
          fileSha256: FILE_SHA,
        }),
      (err: unknown) => err instanceof RegistrationHistoryError && /can't be mapped/.test(err.message),
    );
  });
});

describe("classifyRegistrationHistory", () => {
  const rows = springFixture();
  const mapping = suggestedMapping(rows);
  const classified = classifyRegistrationHistory({
    rows,
    mapping,
    existingKeys: [],
    fileName: FILE_NAME,
    fileSha256: FILE_SHA,
  });

  it("keeps Completed rows only and counts the other statuses", () => {
    assert.equal(classified.preview.totals.wouldAdd, 5);
    assert.equal(classified.preview.totals.alreadyPresent, 1);
    assert.equal(classified.preview.totals.skipped.not_completed, 8);
    assert.equal(classified.preview.totals.skipped.umpire, 2);
    assert.equal(classified.preview.totals.skipped.missing_birth_date, 1);
    assert.equal(classified.preview.totals.skipped.unparseable, 1);
    assert.equal(classified.preview.totals.skipped.unmapped_or_fall, 2);
    assert.equal(classified.preview.birthDateCoveragePercent, 95);
    assert.equal(classified.inserts.length, 5);
    assert.ok(classified.inserts.every((entry) => entry.teamId === null));
    assert.ok(classified.inserts.every((entry) => entry.orderPaymentStatus.trim().toLowerCase() === "completed"));
  });

  it("skips Fall and unknown programs and leaves their completed rows unmapped", () => {
    const fall = classified.preview.programs.find((program) => program.programName === FALL);
    const summer = classified.preview.programs.find((program) => program.programName === SUMMER);
    assert.equal(fall?.disposition, "skip");
    assert.equal(fall?.fallLocked, true);
    assert.equal(fall?.totals.wouldAdd, 0);
    assert.equal(fall?.totals.skipped.unmapped_or_fall, 1);
    assert.equal(fall?.totals.skipped.not_completed, 2);
    assert.equal(summer?.disposition, "skip");
    assert.equal(summer?.totals.skipped.unmapped_or_fall, 1);
    const gonzales = classified.preview.programs.find((program) => program.programName === GONZALES);
    assert.equal(gonzales?.organizationId, "gonzales");
    assert.equal(gonzales?.seasonYear, 2026);
    assert.equal(gonzales?.totals.wouldAdd, 3);
    const ascension = classified.preview.programs.find((program) => program.programName === ASCENSION);
    assert.equal(ascension?.organizationId, "ascension");
    assert.equal(ascension?.divisions.find((division) => division.divisionName === "Umpire Clinic")?.skipped.umpire, 1);
    assert.equal(ascension?.divisions.find((division) => division.divisionName === "Volunteer Umpire")?.skipped.umpire, 1);
  });

  it("leaves an existing order-line key out of the insert list", () => {
    const nine = classified.inserts.find((entry) => entry.sportsConnectOrderNo === "2002");
    assert.ok(nine);
    const existing: ExistingHistoryKey[] = [
      {
        organizationId: nine.organizationId,
        seasonYear: nine.seasonYear,
        sportsConnectRowKey: nine.sportsConnectRowKey,
      },
    ];
    const again = classifyRegistrationHistory({
      rows,
      mapping,
      existingKeys: existing,
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    assert.equal(again.preview.totals.wouldAdd, 4);
    assert.equal(again.preview.totals.alreadyPresent, 2);
    assert.equal(
      again.inserts.some((entry) => entry.sportsConnectRowKey === nine.sportsConnectRowKey),
      false,
    );
  });

  it("drops medical, insurance, and physician columns from rawRow", () => {
    for (const name of EXCLUDED_RAW_ROW_COLUMN_NAMES) {
      assert.equal(isExcludedRawColumn(name), true, name);
    }
    const first = classified.inserts.find((entry) => entry.sportsConnectOrderNo === "1001");
    assert.ok(first);
    assert.equal(first.rawRow["Program Name"], GONZALES);
    assert.equal(first.rawRow.City, "Sample City");
    assert.equal(ALLERGY in first.rawRow, false);
    assert.equal("Insurance Company" in first.rawRow, false);
    assert.equal("Policy Number" in first.rawRow, false);
    assert.equal("Physician Phone" in first.rawRow, false);
  });

  it("keeps names, emails, phones, addresses, and birth dates out of the preview", () => {
    assert.equal(previewContainsRowPii(classified.preview, PII_NEEDLES), null);
    const json = JSON.stringify(classified.preview);
    for (const needle of PII_NEEDLES) assert.equal(json.includes(needle), false, needle);
  });
});

describe("registration history commit and undo", () => {
  function prepared() {
    const rows = springFixture();
    const mapping = suggestedMapping(rows);
    const open = classifyRegistrationHistory({
      rows,
      mapping,
      existingKeys: [],
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    const nine = open.inserts.find((entry) => entry.sportsConnectOrderNo === "2002");
    assert.ok(nine);
    const db = new MemoryDb();
    const seeded: StoredEnrollment = {
      id: "already",
      organizationId: "ascension",
      seasonYear: 2026,
      sportsConnectRowKey: nine.sportsConnectRowKey,
      importRunId: null,
      teamId: "roster-team",
      fullName: "Already There",
    };
    const older: StoredEnrollment = {
      id: "older",
      organizationId: "gonzales",
      seasonYear: 2026,
      sportsConnectRowKey: "old-key-not-in-file",
      importRunId: "old-run",
      teamId: "roster-team",
      fullName: "Older Import",
    };
    db.enrollments.push(seeded, older);
    const existingKeys: ExistingHistoryKey[] = [
      {
        organizationId: seeded.organizationId,
        seasonYear: seeded.seasonYear,
        sportsConnectRowKey: seeded.sportsConnectRowKey,
      },
    ];
    return { rows, mapping, db, seeded, older, existingKeys };
  }

  it("inserts enrollment rows only and does not touch an existing key", async () => {
    const { rows, mapping, db, seeded, older, existingKeys } = prepared();
    const beforeSeed = structuredClone(seeded);
    const beforeOlder = structuredClone(older);
    const classified = classifyRegistrationHistory({
      rows,
      mapping,
      existingKeys,
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    const stored = await storeRegistrationHistoryPreview(asDb(db), {
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
      preview: classified.preview,
      normalizedMapping: classified.normalizedMapping,
      classificationDigest: classified.classificationDigest,
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

    assert.equal(result.totals.wouldAdd, classified.preview.totals.wouldAdd);
    assert.equal(result.totals.alreadyPresent, classified.preview.totals.alreadyPresent);
    assert.deepEqual(
      result.runs.map((run) => run.organizationId),
      ["ascension", "gonzales"],
    );
    assert.equal(result.runs.find((run) => run.organizationId === "gonzales")?.inserted, 3);
    assert.equal(result.runs.find((run) => run.organizationId === "ascension")?.inserted, 1);
    assert.equal(db.enrollments.filter((row) => row.importRunId && row.importRunId !== "old-run").length, 4);
    assert.ok(db.enrollments.every((row) => row.teamId === null || row.id === "already" || row.id === "older"));
    assert.deepEqual(seeded, beforeSeed);
    assert.deepEqual(older, beforeOlder);
    assert.equal(
      db.enrollments.some((row) => row.sportsConnectRowKey === seeded.sportsConnectRowKey && row.id !== "already"),
      false,
    );
    assert.equal(db.calls.some((call) => call.startsWith("team.") || call.startsWith("teamPlayer.")), false);
    assert.equal(db.calls.includes("enrollment.update"), false);
    assert.equal(db.calls.includes("enrollment.upsert"), false);
    assert.equal(db.calls.includes("enrollment.delete"), false);
    assert.equal(db.calls.includes("enrollment.createMany"), true);
  });

  it("refuses a commit when the file hash or mapping does not match the dry-run", async () => {
    const { rows, mapping, db, existingKeys } = prepared();
    const classified = classifyRegistrationHistory({
      rows,
      mapping,
      existingKeys,
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    const stored = await storeRegistrationHistoryPreview(asDb(db), {
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
      preview: classified.preview,
      normalizedMapping: classified.normalizedMapping,
      classificationDigest: classified.classificationDigest,
      createdByAdminId: null,
    });
    const enrollmentCount = db.enrollments.length;
    await assert.rejects(
      () =>
        commitRegistrationHistory(asDb(db), {
          previewRunId: stored.id,
          fileName: FILE_NAME,
          fileSha256: "b".repeat(64),
          mapping,
          rows,
          createdByAdminId: null,
        }),
      (err: unknown) => err instanceof RegistrationHistoryError && /dry-run/i.test(err.message),
    );
    const remapped = mapping.map((entry) =>
      entry.programName === ASCENSION ? { programName: ASCENSION, action: "skip" } : entry,
    );
    await assert.rejects(
      () =>
        commitRegistrationHistory(asDb(db), {
          previewRunId: stored.id,
          fileName: FILE_NAME,
          fileSha256: FILE_SHA,
          mapping: remapped,
          rows,
          createdByAdminId: null,
        }),
      (err: unknown) => err instanceof RegistrationHistoryError && /mapping/i.test(err.message),
    );
    assert.equal(db.runs.find((run) => run.id === stored.id)?.status, "PREVIEW");
    assert.equal(db.enrollments.length, enrollmentCount);
    assert.equal(db.calls.includes("enrollment.createMany"), false);
  });

  it("undo deletes only that batch", async () => {
    const { rows, mapping, db, seeded, older, existingKeys } = prepared();
    const classified = classifyRegistrationHistory({
      rows,
      mapping,
      existingKeys,
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
    });
    const stored = await storeRegistrationHistoryPreview(asDb(db), {
      fileName: FILE_NAME,
      fileSha256: FILE_SHA,
      preview: classified.preview,
      normalizedMapping: classified.normalizedMapping,
      classificationDigest: classified.classificationDigest,
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
    const gonzales = result.runs.find((run) => run.organizationId === "gonzales");
    const ascension = result.runs.find((run) => run.organizationId === "ascension");
    assert.ok(gonzales && ascension);
    const counted = await countRegistrationHistoryUndo(asDb(db), {
      runId: gonzales.id,
      organizationId: "gonzales",
    });
    assert.equal(counted.enrollmentCount, 3);
    assert.equal(db.enrollments.some((row) => row.importRunId === gonzales.id), true);
    const undone = await undoRegistrationHistory(asDb(db), {
      runId: gonzales.id,
      organizationId: "gonzales",
    });
    assert.equal(undone.enrollmentCount, 3);
    assert.equal(db.enrollments.some((row) => row.importRunId === gonzales.id), false);
    assert.equal(db.enrollments.some((row) => row.importRunId === ascension.id), true);
    assert.equal(db.enrollments.some((row) => row.id === seeded.id && row.teamId === "roster-team"), true);
    assert.equal(db.enrollments.some((row) => row.id === older.id && row.importRunId === "old-run"), true);
    assert.equal(db.runs.find((run) => run.id === gonzales.id)?.status, "UNDONE");
    await assert.rejects(
      () => undoRegistrationHistory(asDb(db), { runId: gonzales.id, organizationId: "gonzales" }),
      (err: unknown) => err instanceof RegistrationHistoryError && /already undone/i.test(err.message),
    );
  });
});

describe("prune ignores registration history rows", () => {
  const birth = new Date("2016-04-02T00:00:00.000Z");

  it("does not treat history rows as existing and does not use them to delete roster players", () => {
    const plan = planStaleEnrollmentPrune(
      [
        {
          id: "history",
          fullName: "Player One",
          birthDate: birth,
          sportsConnectPlayerId: "sc-history",
          sportsConnectRowKey: "history-key",
          reportKind: "PLAYER_REG_HISTORY",
        },
        {
          id: "history-name",
          fullName: "Player Five",
          birthDate: birth,
          sportsConnectPlayerId: null,
          sportsConnectRowKey: "history-name-key",
          reportKind: "PLAYER_REG_HISTORY",
        },
        {
          id: "live",
          fullName: "Player Two",
          birthDate: birth,
          sportsConnectPlayerId: "sc-live",
          sportsConnectRowKey: "live-key",
          reportKind: "PLAYER_REG",
        },
        {
          id: "stale",
          fullName: "Player Three",
          birthDate: birth,
          sportsConnectPlayerId: "sc-stale",
          sportsConnectRowKey: "stale-key",
          reportKind: null,
        },
        {
          id: "stale-name",
          fullName: "Player Four",
          birthDate: birth,
          sportsConnectPlayerId: null,
          sportsConnectRowKey: "stale-name-key",
          reportKind: null,
        },
      ],
      new Set(["live-key"]),
    );
    assert.deepEqual(plan.staleIds, ["stale", "stale-name"]);
    assert.deepEqual(plan.stalePlayerIds, ["sc-stale"]);
    assert.deepEqual(plan.staleNameDobs, [{ fullName: "Player Four", birthDate: birth }]);
    assert.equal(plan.kept, 1);
    assert.equal(plan.skipped, null);

    const historyOnly = planStaleEnrollmentPrune(
      [
        {
          id: "history",
          fullName: "Player One",
          birthDate: birth,
          sportsConnectPlayerId: "sc-history",
          sportsConnectRowKey: "history-key",
          reportKind: "PLAYER_REG_HISTORY",
        },
      ],
      new Set(["some-other-key"]),
    );
    assert.deepEqual(historyOnly.staleIds, []);
    assert.deepEqual(historyOnly.stalePlayerIds, []);
    assert.deepEqual(historyOnly.staleNameDobs, []);
  });

  it("builds an enrollment filter that drops history runs", () => {
    assert.deepEqual(
      excludeRegistrationHistoryEnrollment({ organizationId: "gonzales", seasonYear: 2026 }),
      {
        AND: [
          { organizationId: "gonzales", seasonYear: 2026 },
          {
            OR: [
              { importRunId: null },
              { importRun: { is: { reportKind: { not: "PLAYER_REG_HISTORY" } } } },
            ],
          },
        ],
      },
    );
  });
});

describe("readRegistrationHistoryExport", () => {
  it("reads a workbook with the three-program shape", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Program Name", "Division Name", "Order Payment Status", "Player First Name", "Player Last Name", "Order No", "Birth Date"],
      [GONZALES, "8U", "Completed", "Player", "One", "1001", "2016-04-02"],
      [GONZALES, "8U", "Cancelled", "Player", "Four", "1004", "2016-07-05"],
      [ASCENSION, "Umpire Clinic", "Completed", "Player", "Ten", "2003", "1990-01-01"],
      [FALL, "8U", "Completed", "Player", "Fifteen", "3001", "2016-04-02"],
      [FALL, "8U", "Failed", "Player", "Seventeen", "3003", "2016-06-04"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Enrollment");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const parsed = readRegistrationHistoryExport({ buffer, fileName: FILE_NAME });
    const classified = classifyRegistrationHistory({
      rows: parsed.rows,
      mapping: suggestedMapping(parsed.rows),
      existingKeys: [],
      fileName: parsed.fileName,
      fileSha256: FILE_SHA,
    });
    assert.equal(classified.preview.totals.wouldAdd, 1);
    assert.equal(classified.preview.totals.skipped.not_completed, 2);
    assert.equal(classified.preview.totals.skipped.umpire, 1);
    assert.equal(classified.preview.totals.skipped.unmapped_or_fall, 1);
    assert.equal(previewContainsRowPii(classified.preview, ["Player One", "2016-04-02"]), null);
  });
});
