import { PLAYER_REG_HISTORY_REPORT_KIND } from "./registrationHistoryKind";

/**
 * Split-batch summary fields are written only by the split commit.
 * Registration-history runs are changed only by that commit and its undo.
 */

export const SPLIT_SUMMARY_FIELDS = ["splitBatch", "splitBatchId", "splitBatchRunIds"] as const;

export class ImportRunSummaryError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "ImportRunSummaryError";
  }
}

/** Generic create/update/delete cannot touch a registration-history run. */
export function assertRegistrationHistoryRunImmutable(reportKind: string | null | undefined): void {
  if (reportKind === PLAYER_REG_HISTORY_REPORT_KIND) {
    throw new ImportRunSummaryError("This registration history import cannot be changed here.");
  }
}

export function summaryMarksSplitBatch(summary: unknown): boolean {
  const record = asRecord(summary);
  if (record.splitBatch === true) return true;
  return typeof record.splitBatchId === "string" && record.splitBatchId.length > 0;
}

export function hasSplitSummaryField(summary: Record<string, unknown>): boolean {
  return SPLIT_SUMMARY_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(summary, field));
}

/**
 * Generic run creation cannot store split-batch fields.
 * Only the split commit writes them, on its own transaction client.
 */
export function assertImportRunSummaryCreate(
  summary: Record<string, unknown> | null | undefined,
): void {
  if (summary == null) return;
  if (hasSplitSummaryField(summary)) {
    throw new ImportRunSummaryError("Split batch fields cannot be added to an import run.");
  }
}

/**
 * `nextSummary === undefined` means this update does not touch summary.
 * A split-batch run cannot have its summary replaced, cleared, or edited.
 * A normal run cannot gain split-batch fields.
 */
export function assertImportRunSummaryPatch(
  existingSummary: unknown,
  nextSummary: Record<string, unknown> | null | undefined,
): void {
  if (nextSummary === undefined) return;
  if (summaryMarksSplitBatch(existingSummary)) {
    throw new ImportRunSummaryError(
      "This import is part of a split batch. Its summary cannot be changed.",
    );
  }
  if (nextSummary !== null && hasSplitSummaryField(nextSummary)) {
    throw new ImportRunSummaryError("Split batch fields cannot be added to an import run.");
  }
}

function asRecord(summary: unknown): Record<string, unknown> {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return {};
  return summary as Record<string, unknown>;
}
