/**
 * Split-batch summary fields are written only by the split commit.
 * PATCH and other run updates cannot add or remove them.
 */

export const SPLIT_SUMMARY_FIELDS = ["splitBatch", "splitBatchId", "splitBatchRunIds"] as const;

export class ImportRunSummaryError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "ImportRunSummaryError";
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
