import { isFallProgramName, isSpringProgramName, isSpringSplitOrg, splitImportDenial } from "./divisionLeagueSplit";
import { REGISTRATION_HISTORY_PREVIEW_ORG } from "./registrationHistoryKind";
import { PLAYER_REG_HISTORY_REPORT_KIND } from "./registrationHistoryKind";
import {
  canonicalHistoryMapping,
  classifyRegistrationHistory,
  enrollmentReadTargets,
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
import { lockSpringEnrollment, springEnrollmentSeasonYears } from "./springEnrollmentLock";
import { summaryMarksSplitBatch } from "./splitBatchSummary";

export const REGISTRATIONS_CHANGED_MESSAGE =
  "The registrations changed since the preview. Run the preview again.";

const SPLIT_BATCH_MISMATCH =
  "This split import cannot be undone because the batch is not one Spring program shared by Gonzales DYB and Ascension LL. Nothing was removed.";

const SPLIT_MEMBER_UNFINISHED =
  "This split import cannot be undone because a league run is missing or is not finished. Nothing was removed.";

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
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  sportsConnectImportRun: {
    findFirst(args: { where: Record<string, unknown> }): Promise<HistoryRunRow | null>;
    findMany(args: {
      where: { summary: { path: ["splitBatchId"]; equals: string } };
    }): Promise<HistoryRunRow[]>;
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
    classificationDigest: string;
    createdByAdminId: string | null;
  },
): Promise<{ id: string }> {
  const row = await db.sportsConnectImportRun.create({
    data: {
      organizationId: REGISTRATION_HISTORY_PREVIEW_ORG,
      seasonYear: mappingSeasonYear(input.normalizedMapping),
      reportKind: PLAYER_REG_HISTORY_REPORT_KIND,
      status: "PREVIEW",
      sourceFileName: input.fileName,
      createdByAdminId: input.createdByAdminId,
      summary: {
        role: "preview",
        fileSha256: input.fileSha256,
        mappingCanonical: canonicalHistoryMapping(input.normalizedMapping),
        countsSignature: historyCountsSignature(input.preview),
        classificationDigest: input.classificationDigest,
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
    isMaster?: boolean;
  },
): Promise<{
  previewRunId: string;
  runs: Array<{
    id: string;
    organizationId: string;
    seasonYear: number;
    inserted: number;
    alreadyPresent: number;
    alreadySameLeague: number;
    alreadyOtherLeague: number;
  }>;
  totals: HistoryPreview["totals"];
}> {
  const denial = splitImportDenial(input.isMaster === true, input.mapping);
  if (denial) throw new RegistrationHistoryError(denial, 403);
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
    const normalizedEarly = normalizeHistoryMapping(programNamesInRows(input.rows), input.mapping);
    for (const seasonYear of springEnrollmentSeasonYears(normalizedEarly)) {
      await lockSpringEnrollment(tx, seasonYear);
    }
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

    const normalized = normalizedEarly;
    const keyTargets = enrollmentReadTargets(normalized);
    const existingKeys = keyTargets.length
      ? await tx.enrollment.findMany({
          where: {
            OR: keyTargets.map((target) => ({
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
    if (classified.classificationDigest !== stored.classificationDigest) {
      throw new RegistrationHistoryError(REGISTRATIONS_CHANGED_MESSAGE, 409);
    }
    if (historyCountsSignature(classified.preview) !== stored.countsSignature) {
      throw new RegistrationHistoryError(
        `Enrollment changed since the dry-run, or this file does not match it. ${DRY_RUN_AGAIN}`,
        409,
      );
    }
    if (classified.preview.unplaceable.length > 0) {
      throw new RegistrationHistoryError(
        unplaceableCommitMessage(classified.preview.unplaceable),
        409,
      );
    }

    const splitEntry = normalized.find(
      (entry): entry is Extract<NormalizedHistoryMappingEntry, { action: "split" }> => entry.action === "split",
    );
    const targets = commitRunTargets(normalized, classified.preview);
    const grouped = groupInserts(classified.inserts);
    const runs: Array<{
      id: string;
      organizationId: string;
      seasonYear: number;
      inserted: number;
      alreadyPresent: number;
      alreadySameLeague: number;
      alreadyOtherLeague: number;
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
            source: splitEntry ? "split" : "map",
            programName: splitEntry?.programName ?? programNamesForTarget(normalized, target)[0] ?? null,
            programNames: splitEntry
              ? [splitEntry.programName]
              : programNamesForTarget(normalized, target),
            fileSha256: input.fileSha256,
            previewRunId: input.previewRunId,
            wouldAdd: counts.wouldAdd,
            alreadyPresent: counts.alreadyPresent,
            alreadySameLeague: counts.alreadySameLeague,
            alreadyOtherLeague: counts.alreadyOtherLeague,
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
        alreadySameLeague: counts.alreadySameLeague,
        alreadyOtherLeague: counts.alreadyOtherLeague,
      });
    }

    if (splitEntry && runs.length > 0) {
      const batchRuns = runs.filter(
        (run) =>
          isSpringSplitOrg(run.organizationId) && run.seasonYear === splitEntry.seasonYear,
      );
      if (batchRuns.length !== runs.length) {
        throw new RegistrationHistoryError(
          "A split import can only include one Spring program. Set every other program to Skip.",
          409,
        );
      }
      const splitBatchRunIds = batchRuns.map((run) => run.id);
      for (const run of batchRuns) {
        const storedRun = await tx.sportsConnectImportRun.findFirst({ where: { id: run.id } });
        await tx.sportsConnectImportRun.update({
          where: { id: run.id },
          data: {
            summary: {
              ...asRecord(storedRun?.summary),
              splitBatch: true,
              splitBatchId: input.previewRunId,
              splitBatchRunIds,
              programName: splitEntry.programName,
              source: "split",
            },
          },
        });
      }
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
  input: { runId: string; organizationId: string; isMaster?: boolean },
): Promise<{ enrollmentCount: number; splitBatch: boolean; runCount: number }> {
  const run = await loadCommitRun(db, input);
  const batch = await loadUndoBatch(db, run, input.isMaster === true);
  let enrollmentCount = 0;
  for (const item of batch) {
    enrollmentCount += await db.enrollment.count({ where: { importRunId: item.id } });
  }
  return {
    enrollmentCount,
    splitBatch: asRecord(run.summary).splitBatch === true,
    runCount: batch.length,
  };
}

export async function undoRegistrationHistory(
  db: HistoryDb,
  input: { runId: string; organizationId: string; isMaster?: boolean },
): Promise<{ enrollmentCount: number; undone: true; runCount: number }> {
  return db.$transaction(async (tx) => {
    const run = await loadCommitRun(tx, input);
    if (runNeedsSpringEnrollmentLock(run)) {
      await lockSpringEnrollment(tx, run.seasonYear);
    }
    const batch = await loadUndoBatch(tx, run, input.isMaster === true);
    const counts = new Map<string, number>();
    let enrollmentCount = 0;
    for (const item of batch) {
      const count = await tx.enrollment.count({ where: { importRunId: item.id } });
      counts.set(item.id, count);
      enrollmentCount += count;
    }
    for (const item of batch) {
      const expected = counts.get(item.id) ?? 0;
      const deleted = await tx.enrollment.deleteMany({ where: { importRunId: item.id } });
      if (deleted.count !== expected) {
        throw new RegistrationHistoryError(
          "Undo stopped because the batch changed. Nothing was removed.",
          409,
        );
      }
      await tx.sportsConnectImportRun.update({
        where: { id: item.id },
        data: {
          status: "UNDONE",
          completedAt: new Date(),
          summary: {
            ...asRecord(item.summary),
            undoneEnrollmentCount: deleted.count,
            batchUndoneEnrollmentCount: enrollmentCount,
          },
        },
      });
    }
    return { enrollmentCount, undone: true, runCount: batch.length };
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
  classificationDigest: string;
} {
  const record = asRecord(summary);
  return {
    role: typeof record.role === "string" ? record.role : null,
    fileSha256: typeof record.fileSha256 === "string" ? record.fileSha256 : "",
    mappingCanonical: typeof record.mappingCanonical === "string" ? record.mappingCanonical : "",
    countsSignature: typeof record.countsSignature === "string" ? record.countsSignature : "",
    classificationDigest:
      typeof record.classificationDigest === "string" ? record.classificationDigest : "",
  };
}

function summaryRole(summary: unknown): string | null {
  return readSummary(summary).role;
}

function asRecord(summary: unknown): Record<string, unknown> {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return {};
  return summary as Record<string, unknown>;
}

function mappingSeasonYear(mapping: readonly NormalizedHistoryMappingEntry[]): number {
  for (const entry of mapping) {
    if (entry.action === "map" || entry.action === "split") return entry.seasonYear;
  }
  return 2026;
}

function unplaceableCommitMessage(
  divisions: HistoryPreview["unplaceable"],
): string {
  const names = divisions.map((division) => division.divisionName);
  const shown = names.slice(0, 12);
  const extra = names.length > shown.length ? ` and ${names.length - shown.length} more` : "";
  return `Assign a league for each division that could not be placed, then dry-run again. Still waiting: ${shown.join(", ")}${extra}.`;
}

function commitRunTargets(
  mapping: readonly NormalizedHistoryMappingEntry[],
  preview: HistoryPreview,
): Array<{ organizationId: HistoryOrgId; seasonYear: number }> {
  const targets = uniqueTargets(mapping);
  const seen = new Set(targets.map((target) => `${target.organizationId}\0${target.seasonYear}`));
  for (const program of preview.programs) {
    if (program.disposition !== "split" || program.seasonYear == null) continue;
    for (const league of program.leagues) {
      const active = league.wouldAdd + league.alreadySameLeague + league.alreadyOtherLeague > 0;
      if (!active) continue;
      const id = `${league.organizationId}\0${program.seasonYear}`;
      if (seen.has(id)) continue;
      seen.add(id);
      targets.push({ organizationId: league.organizationId, seasonYear: program.seasonYear });
    }
  }
  targets.sort(
    (a, b) => a.organizationId.localeCompare(b.organizationId) || a.seasonYear - b.seasonYear,
  );
  return targets;
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
  let alreadySameLeague = 0;
  let alreadyOtherLeague = 0;
  for (const program of preview.programs) {
    if (program.disposition === "split") {
      if (program.seasonYear !== seasonYear) continue;
      const league = program.leagues.find((item) => item.organizationId === organizationId);
      if (!league) continue;
      wouldAdd += league.wouldAdd;
      alreadyPresent += league.alreadySameLeague + league.alreadyOtherLeague;
      alreadySameLeague += league.alreadySameLeague;
      alreadyOtherLeague += league.alreadyOtherLeague;
      continue;
    }
    if (program.organizationId !== organizationId || program.seasonYear !== seasonYear) continue;
    wouldAdd += program.totals.wouldAdd;
    alreadyPresent += program.totals.alreadyPresent;
    alreadySameLeague += program.totals.alreadySameLeague;
    alreadyOtherLeague += program.totals.alreadyOtherLeague;
  }
  return { wouldAdd, alreadyPresent, alreadySameLeague, alreadyOtherLeague };
}

function runNeedsSpringEnrollmentLock(run: HistoryRunRow): boolean {
  if (summaryMarksSplitBatch(run.summary)) return true;
  if (!isSpringSplitOrg(run.organizationId)) return false;
  return programNamesFromSummary(run.summary).some((name) => isSpringProgramName(name));
}

function programNamesFromSummary(summary: unknown): string[] {
  const record = asRecord(summary);
  const names = stringArray(record.programNames);
  if (typeof record.programName === "string" && record.programName.length > 0) {
    names.push(record.programName);
  }
  return names;
}

function programNamesForTarget(
  mapping: readonly NormalizedHistoryMappingEntry[],
  target: { organizationId: string; seasonYear: number },
): string[] {
  return mapping
    .filter(
      (entry) =>
        entry.action === "map" &&
        entry.organizationId === target.organizationId &&
        entry.seasonYear === target.seasonYear,
    )
    .map((entry) => entry.programName);
}

async function loadUndoBatch(
  db: HistoryTx,
  run: HistoryRunRow,
  isMaster: boolean,
): Promise<HistoryRunRow[]> {
  if (!summaryMarksSplitBatch(run.summary)) return [run];
  if (!isMaster) {
    throw new RegistrationHistoryError(
      "Only a master admin can undo a split Spring import.",
      403,
    );
  }
  const batchId = splitBatchIdOf(run.summary);
  if (!batchId) {
    throw new RegistrationHistoryError(SPLIT_BATCH_MISMATCH, 409);
  }
  const found = await db.sportsConnectImportRun.findMany({
    where: {
      summary: { path: ["splitBatchId"], equals: batchId },
    },
  });
  const shaped = found.filter((item) => isSplitBatchShape(item, batchId, run.seasonYear));
  if (!shaped.some((item) => item.id === run.id)) {
    throw new RegistrationHistoryError(SPLIT_BATCH_MISMATCH, 409);
  }
  const expectedIds = agreedSplitBatchRunIds(shaped);
  if (!expectedIds.includes(run.id)) {
    throw new RegistrationHistoryError(SPLIT_BATCH_MISMATCH, 409);
  }

  const byId = new Map(found.map((item) => [item.id, item]));
  const members: HistoryRunRow[] = [];
  for (const id of expectedIds) {
    const loaded = byId.get(id) ?? (await db.sportsConnectImportRun.findFirst({ where: { id } }));
    if (!loaded) {
      throw new RegistrationHistoryError(SPLIT_MEMBER_UNFINISHED, 409);
    }
    members.push(loaded);
  }

  const expectedSet = new Set(expectedIds);
  const shapedIds = new Set(shaped.map((item) => item.id));
  if (
    shapedIds.size !== expectedIds.length ||
    expectedIds.some((id) => !shapedIds.has(id)) ||
    shaped.some((item) => !expectedSet.has(item.id))
  ) {
    throw new RegistrationHistoryError(SPLIT_BATCH_MISMATCH, 409);
  }

  validateSplitUndoBatch(members, batchId, expectedIds);
  return members;
}

/** Structural batch membership. Status is checked later so a non-DONE partner cannot be dropped. */
function isSplitBatchShape(item: HistoryRunRow, batchId: string, seasonYear: number): boolean {
  const summary = asRecord(item.summary);
  const programName = typeof summary.programName === "string" ? summary.programName : "";
  return (
    item.reportKind === PLAYER_REG_HISTORY_REPORT_KIND &&
    item.seasonYear === seasonYear &&
    summary.role === "commit" &&
    summary.source === "split" &&
    summary.splitBatch === true &&
    summary.splitBatchId === batchId &&
    isSpringSplitOrg(item.organizationId) &&
    isSpringProgramName(programName) &&
    !isFallProgramName(programName)
  );
}

function splitBatchIdOf(summary: unknown): string | null {
  const id = asRecord(summary).splitBatchId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function splitBatchRunIdsOf(summary: unknown): string[] | null {
  const value = asRecord(summary).splitBatchRunIds;
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return null;
  if (!value.every((item) => typeof item === "string" && item.length > 0)) return null;
  if (new Set(value).size !== value.length) return null;
  return value as string[];
}

/** The recorded id list must be identical, including order, on every shaped member. */
function agreedSplitBatchRunIds(members: readonly HistoryRunRow[]): string[] {
  const first = splitBatchRunIdsOf(members[0]?.summary);
  if (!first) {
    throw new RegistrationHistoryError(SPLIT_BATCH_MISMATCH, 409);
  }
  const same = members.every((item) => {
    const list = splitBatchRunIdsOf(item.summary);
    return !!list && list.length === first.length && list.every((id, index) => id === first[index]);
  });
  if (!same) {
    throw new RegistrationHistoryError(SPLIT_BATCH_MISMATCH, 409);
  }
  return first;
}

function validateSplitUndoBatch(
  runs: readonly HistoryRunRow[],
  batchId: string,
  expectedIds: readonly string[],
): void {
  if (runs.length !== expectedIds.length || runs.length < 1 || runs.length > 2) {
    throw new RegistrationHistoryError(SPLIT_BATCH_MISMATCH, 409);
  }
  const orgs = new Set<string>();
  let seasonYear: number | null = null;
  for (let index = 0; index < runs.length; index += 1) {
    const item = runs[index]!;
    if (item.id !== expectedIds[index]) {
      throw new RegistrationHistoryError(SPLIT_BATCH_MISMATCH, 409);
    }
    if (item.status !== "DONE") {
      throw new RegistrationHistoryError(SPLIT_MEMBER_UNFINISHED, 409);
    }
    const summary = asRecord(item.summary);
    const programName = typeof summary.programName === "string" ? summary.programName : "";
    const orgOk = isSpringSplitOrg(item.organizationId) && !orgs.has(item.organizationId);
    const seasonOk = seasonYear == null || item.seasonYear === seasonYear;
    const springOk = isSpringProgramName(programName) && !isFallProgramName(programName);
    if (
      item.reportKind !== PLAYER_REG_HISTORY_REPORT_KIND ||
      summary.role !== "commit" ||
      summary.source !== "split" ||
      summary.splitBatch !== true ||
      summary.splitBatchId !== batchId ||
      !orgOk ||
      !seasonOk ||
      !springOk
    ) {
      throw new RegistrationHistoryError(SPLIT_BATCH_MISMATCH, 409);
    }
    orgs.add(item.organizationId);
    seasonYear = item.seasonYear;
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
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
