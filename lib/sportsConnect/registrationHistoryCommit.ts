import { REGISTRATION_HISTORY_PREVIEW_ORG } from "./registrationHistoryKind";
import { PLAYER_REG_HISTORY_REPORT_KIND } from "./registrationHistoryKind";
import {
  canonicalHistoryMapping,
  classifyRegistrationHistory,
  historyCountsSignature,
  normalizeHistoryMapping,
  programNamesInRows,
  RegistrationHistoryError,
  type ExistingHistoryKey,
  type HistoryEnrollmentInsert,
  type HistoryMappingEntry,
  type HistoryOrgId,
  type HistoryPreview,
  type NormalizedHistoryMappingEntry,
} from "./registrationHistory";

export type HistoryRunRow = {
  id: string;
  organizationId: string;
  seasonYear: number;
  reportKind: string;
  status: string;
  summary: unknown;
  sourceFileName: string | null;
};

export type HistoryTx = {
  sportsConnectImportRun: {
    findFirst(args: { where: Record<string, unknown> }): Promise<HistoryRunRow | null>;
    updateMany(args: {
      where: { id: string; reportKind: string; status: string };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    create(args: { data: Record<string, unknown> }): Promise<HistoryRunRow>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<HistoryRunRow>;
  };
  enrollment: {
    findMany(args: {
      where: { OR: Array<{ organizationId: string; seasonYear: number }> };
      select: {
        organizationId: true;
        seasonYear: true;
        sportsConnectRowKey: true;
      };
    }): Promise<ExistingHistoryKey[]>;
    createMany(args: {
      data: Array<Record<string, unknown>>;
      skipDuplicates: true;
    }): Promise<{ count: number }>;
    count(args: { where: { importRunId: string } }): Promise<number>;
    deleteMany(args: { where: { importRunId: string } }): Promise<{ count: number }>;
  };
};

export type HistoryDb = HistoryTx & {
  $transaction<T>(fn: (tx: HistoryTx) => Promise<T>): Promise<T>;
};

const DRY_RUN_AGAIN = "Run a new dry-run.";

export async function storeRegistrationHistoryPreview(
  db: HistoryTx,
  input: {
    fileName: string;
    fileSha256: string;
    preview: HistoryPreview;
    normalizedMapping: NormalizedHistoryMappingEntry[];
    createdByAdminId: string | null;
  },
): Promise<{ id: string }> {
  const mappedYear = input.normalizedMapping.find((entry) => entry.action === "map");
  const row = await db.sportsConnectImportRun.create({
    data: {
      organizationId: REGISTRATION_HISTORY_PREVIEW_ORG,
      seasonYear: mappedYear?.action === "map" ? mappedYear.seasonYear : 2026,
      reportKind: PLAYER_REG_HISTORY_REPORT_KIND,
      status: "PREVIEW",
      sourceFileName: input.fileName,
      createdByAdminId: input.createdByAdminId,
      summary: {
        role: "preview",
        fileSha256: input.fileSha256,
        mappingCanonical: canonicalHistoryMapping(input.normalizedMapping),
        countsSignature: historyCountsSignature(input.preview),
        preview: input.preview,
      },
    },
  });
  return { id: row.id };
}

export async function commitRegistrationHistory(
  db: HistoryDb,
  input: {
    previewRunId: string;
    fileName: string;
    fileSha256: string;
    mapping: readonly HistoryMappingEntry[];
    rows: readonly Record<string, unknown>[];
    createdByAdminId: string | null;
  },
): Promise<{
  previewRunId: string;
  runs: Array<{
    id: string;
    organizationId: string;
    seasonYear: number;
    inserted: number;
    alreadyPresent: number;
  }>;
  totals: HistoryPreview["totals"];
}> {
  const previewRun = await db.sportsConnectImportRun.findFirst({
    where: {
      id: input.previewRunId,
      reportKind: PLAYER_REG_HISTORY_REPORT_KIND,
      status: "PREVIEW",
    },
  });
  if (!previewRun || previewRun.reportKind !== PLAYER_REG_HISTORY_REPORT_KIND) {
    throw new RegistrationHistoryError(
      `That dry-run is missing or was already used. ${DRY_RUN_AGAIN}`,
      409,
    );
  }
  assertPreviewMatches(previewRun.summary, input);

  return db.$transaction(async (tx) => {
    const claimed = await tx.sportsConnectImportRun.updateMany({
      where: {
        id: input.previewRunId,
        reportKind: PLAYER_REG_HISTORY_REPORT_KIND,
        status: "PREVIEW",
      },
      data: { status: "RUNNING" },
    });
    if (claimed.count !== 1) {
      throw new RegistrationHistoryError(
        `That dry-run is missing or was already used. ${DRY_RUN_AGAIN}`,
        409,
      );
    }
    const current = await tx.sportsConnectImportRun.findFirst({
      where: { id: input.previewRunId },
    });
    if (!current) {
      throw new RegistrationHistoryError(
        `That dry-run is missing or was already used. ${DRY_RUN_AGAIN}`,
        409,
      );
    }
    assertPreviewMatches(current.summary, input);
    const stored = readSummary(current.summary);

    const normalized = normalizeHistoryMapping(programNamesInRows(input.rows), input.mapping);
    const targets = uniqueTargets(normalized);
    const existingKeys = targets.length
      ? await tx.enrollment.findMany({
          where: {
            OR: targets.map((target) => ({
              organizationId: target.organizationId,
              seasonYear: target.seasonYear,
            })),
          },
          select: {
            organizationId: true,
            seasonYear: true,
            sportsConnectRowKey: true,
          },
        })
      : [];
    const classified = classifyRegistrationHistory({
      rows: input.rows,
      mapping: input.mapping,
      existingKeys,
      fileName: input.fileName,
      fileSha256: input.fileSha256,
    });
    if (historyCountsSignature(classified.preview) !== stored.countsSignature) {
      throw new RegistrationHistoryError(
        `Enrollment changed since the dry-run, or this file does not match it. ${DRY_RUN_AGAIN}`,
        409,
      );
    }

    const grouped = groupInserts(classified.inserts);
    const runs: Array<{
      id: string;
      organizationId: string;
      seasonYear: number;
      inserted: number;
      alreadyPresent: number;
    }> = [];
    for (const target of targets) {
      const rows = grouped.get(`${target.organizationId}\0${target.seasonYear}`) ?? [];
      const counts = totalsForTarget(classified.preview, target.organizationId, target.seasonYear);
      if (rows.length !== counts.wouldAdd) {
        throw new RegistrationHistoryError(
          `Dry-run counts did not match the rows to insert. ${DRY_RUN_AGAIN}`,
          409,
        );
      }
      const run = await tx.sportsConnectImportRun.create({
        data: {
          organizationId: target.organizationId,
          seasonYear: target.seasonYear,
          reportKind: PLAYER_REG_HISTORY_REPORT_KIND,
          status: "DONE",
          sourceFileName: input.fileName,
          createdByAdminId: input.createdByAdminId,
          completedAt: new Date(),
          teamPlayerBatchId: null,
          coachBatchId: null,
          summary: {
            role: "commit",
            fileSha256: input.fileSha256,
            previewRunId: input.previewRunId,
            wouldAdd: counts.wouldAdd,
            alreadyPresent: counts.alreadyPresent,
            inserted: rows.length,
          },
        },
      });
      const inserted = rows.length ? await insertEnrollmentRows(tx, rows, run.id) : 0;
      if (inserted !== rows.length) {
        throw new RegistrationHistoryError(
          `Insert count did not match the dry-run. Nothing was saved. ${DRY_RUN_AGAIN}`,
          409,
        );
      }
      runs.push({
        id: run.id,
        organizationId: target.organizationId,
        seasonYear: target.seasonYear,
        inserted,
        alreadyPresent: counts.alreadyPresent,
      });
    }

    await tx.sportsConnectImportRun.update({
      where: { id: input.previewRunId },
      data: {
        status: "DONE",
        completedAt: new Date(),
        summary: {
          ...asRecord(current.summary),
          role: "preview",
          consumedAt: new Date().toISOString(),
          committedRunIds: runs.map((run) => run.id),
        },
      },
    });

    return {
      previewRunId: input.previewRunId,
      runs,
      totals: classified.preview.totals,
    };
  });
}

export async function countRegistrationHistoryUndo(
  db: HistoryTx,
  input: { runId: string; organizationId: string },
): Promise<{ enrollmentCount: number }> {
  const run = await loadCommitRun(db, input);
  const enrollmentCount = await db.enrollment.count({ where: { importRunId: run.id } });
  return { enrollmentCount };
}

export async function undoRegistrationHistory(
  db: HistoryDb,
  input: { runId: string; organizationId: string },
): Promise<{ enrollmentCount: number; undone: true }> {
  return db.$transaction(async (tx) => {
    const run = await loadCommitRun(tx, input);
    const enrollmentCount = await tx.enrollment.count({ where: { importRunId: run.id } });
    const deleted = await tx.enrollment.deleteMany({ where: { importRunId: run.id } });
    if (deleted.count !== enrollmentCount) {
      throw new RegistrationHistoryError(
        "Undo stopped because the batch changed. Nothing was removed.",
        409,
      );
    }
    await tx.sportsConnectImportRun.update({
      where: { id: run.id },
      data: {
        status: "UNDONE",
        completedAt: new Date(),
        summary: {
          ...asRecord(run.summary),
          undoneEnrollmentCount: deleted.count,
        },
      },
    });
    return { enrollmentCount: deleted.count, undone: true };
  });
}

async function loadCommitRun(
  db: HistoryTx,
  input: { runId: string; organizationId: string },
): Promise<HistoryRunRow> {
  const run = await db.sportsConnectImportRun.findFirst({
    where: {
      id: input.runId,
      organizationId: input.organizationId,
      reportKind: PLAYER_REG_HISTORY_REPORT_KIND,
    },
  });
  if (!run || run.reportKind !== PLAYER_REG_HISTORY_REPORT_KIND) {
    throw new RegistrationHistoryError("Import batch not found.", 404);
  }
  if (run.status === "UNDONE") {
    throw new RegistrationHistoryError("This import was already undone.", 409);
  }
  if (run.status !== "DONE" || summaryRole(run.summary) !== "commit") {
    throw new RegistrationHistoryError("Only a finished registration-history import can be undone.", 409);
  }
  return run;
}

function assertPreviewMatches(
  summary: unknown,
  input: {
    fileSha256: string;
    mapping: readonly HistoryMappingEntry[];
    rows: readonly Record<string, unknown>[];
  },
) {
  const stored = readSummary(summary);
  if (stored.role !== "preview" || !stored.fileSha256 || !stored.mappingCanonical) {
    throw new RegistrationHistoryError(`That dry-run is missing its file fingerprint. ${DRY_RUN_AGAIN}`, 409);
  }
  if (stored.fileSha256 !== input.fileSha256) {
    throw new RegistrationHistoryError(
      `This file does not match the dry-run. ${DRY_RUN_AGAIN}`,
      409,
    );
  }
  const normalized = normalizeHistoryMapping(programNamesInRows(input.rows), input.mapping);
  if (canonicalHistoryMapping(normalized) !== stored.mappingCanonical) {
    throw new RegistrationHistoryError(
      `This mapping does not match the dry-run. ${DRY_RUN_AGAIN}`,
      409,
    );
  }
}

function readSummary(summary: unknown): {
  role: string | null;
  fileSha256: string;
  mappingCanonical: string;
  countsSignature: string;
} {
  const record = asRecord(summary);
  return {
    role: typeof record.role === "string" ? record.role : null,
    fileSha256: typeof record.fileSha256 === "string" ? record.fileSha256 : "",
    mappingCanonical: typeof record.mappingCanonical === "string" ? record.mappingCanonical : "",
    countsSignature: typeof record.countsSignature === "string" ? record.countsSignature : "",
  };
}

function summaryRole(summary: unknown): string | null {
  return readSummary(summary).role;
}

function asRecord(summary: unknown): Record<string, unknown> {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return {};
  return summary as Record<string, unknown>;
}

function uniqueTargets(mapping: readonly NormalizedHistoryMappingEntry[]): Array<{
  organizationId: HistoryOrgId;
  seasonYear: number;
}> {
  const targets: Array<{ organizationId: HistoryOrgId; seasonYear: number }> = [];
  const seen = new Set<string>();
  for (const entry of mapping) {
    if (entry.action !== "map") continue;
    const id = `${entry.organizationId}\0${entry.seasonYear}`;
    if (seen.has(id)) continue;
    seen.add(id);
    targets.push({ organizationId: entry.organizationId, seasonYear: entry.seasonYear });
  }
  targets.sort(
    (a, b) => a.organizationId.localeCompare(b.organizationId) || a.seasonYear - b.seasonYear,
  );
  return targets;
}

function groupInserts(inserts: readonly HistoryEnrollmentInsert[]): Map<string, HistoryEnrollmentInsert[]> {
  const grouped = new Map<string, HistoryEnrollmentInsert[]>();
  for (const row of inserts) {
    const id = `${row.organizationId}\0${row.seasonYear}`;
    const list = grouped.get(id) ?? [];
    list.push(row);
    grouped.set(id, list);
  }
  return grouped;
}

function totalsForTarget(preview: HistoryPreview, organizationId: string, seasonYear: number) {
  let wouldAdd = 0;
  let alreadyPresent = 0;
  for (const program of preview.programs) {
    if (program.organizationId !== organizationId || program.seasonYear !== seasonYear) continue;
    wouldAdd += program.totals.wouldAdd;
    alreadyPresent += program.totals.alreadyPresent;
  }
  return { wouldAdd, alreadyPresent };
}

async function insertEnrollmentRows(
  tx: HistoryTx,
  rows: readonly HistoryEnrollmentInsert[],
  importRunId: string,
): Promise<number> {
  let inserted = 0;
  const chunkSize = 200;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const data = rows.slice(index, index + chunkSize).map((row) => ({
      ...row,
      importRunId,
      teamId: null,
    }));
    const result = await tx.enrollment.createMany({ data, skipDuplicates: true });
    inserted += result.count;
  }
  return inserted;
}
