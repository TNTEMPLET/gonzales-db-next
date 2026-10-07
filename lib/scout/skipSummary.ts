const SKIP_REASON_LABELS: Record<string, string> = {
  ai_unavailable_fallback: "AI unavailable fallback",
  ai_cap_fallback: "AI cap fallback",
};

/** Plain-language bucket name. Unknown reasons stay as stored. */
export function scoutSkipReasonLabel(reason: string): string {
  return SKIP_REASON_LABELS[reason] ?? reason;
}

function countOf(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function countedNoun(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Human-readable skip buckets, highest count first. Empty when every count is zero. */
export function formatScoutSkipCounts(counts: Record<string, number> | undefined): string {
  if (!counts) return "";
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => `${scoutSkipReasonLabel(reason)} ${count}`)
    .join(", ");
}

/**
 * Always describes the run, including a quiet inbox.
 * Skip reasons and keyword-fallback keeps are included only when non-zero.
 */
export function formatScoutSyncActivity(input: {
  created?: number;
  appended?: number;
  skipped?: number;
  duplicates?: number;
  skipCounts?: Record<string, number>;
  fallbackKeeps?: number;
}): string {
  const created = countOf(input.created);
  const appended = countOf(input.appended);
  const duplicates = countOf(input.duplicates);
  const skippedFromCounts = Object.values(input.skipCounts ?? {}).reduce((sum, count) => sum + countOf(count), 0);
  const skipped = input.skipped == null ? skippedFromCounts : countOf(input.skipped);
  const checked = created + appended + skipped + duplicates;
  const sentences = [
    `Checked ${countedNoun(checked, "new message", "new messages")}.`,
    `${countedNoun(created, "ticket", "tickets")} created, ${appended} updated.`,
  ];
  const skips = formatScoutSkipCounts(input.skipCounts);
  if (skips) sentences.push(`Skipped ${skips}.`);
  const fallbackKeeps = countOf(input.fallbackKeeps);
  if (fallbackKeeps) sentences.push(`${fallbackKeeps} kept by keyword fallback.`);
  return sentences.join(" ");
}
