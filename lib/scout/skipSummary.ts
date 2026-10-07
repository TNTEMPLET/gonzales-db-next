const SKIP_REASON_LABELS: Record<string, string> = {
  ai_unavailable_fallback: "AI unavailable",
  ai_cap_fallback: "AI limit",
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
 *
 * "Checked N messages" is every message evaluated in this batch: tickets
 * created, messages appended to a ticket, skips, and messages already stored.
 * N is not the rest of the inbox, and it is not only mail that just arrived.
 * A lookback page and a history page both use this total. Skip reasons,
 * already-stored messages, and keyword-fallback keeps are included only when
 * those counts are non-zero. A fallback keep is already inside created or
 * updated, so it is not added to N again.
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
    `Checked ${countedNoun(checked, "message", "messages")}.`,
    `${countedNoun(created, "ticket", "tickets")} created, ${appended} updated.`,
  ];
  const skips = formatScoutSkipCounts(input.skipCounts);
  if (skips) sentences.push(`Skipped ${skips}.`);
  if (duplicates) {
    sentences.push(`${countedNoun(duplicates, "message already stored", "messages already stored")}.`);
  }
  const fallbackKeeps = countOf(input.fallbackKeeps);
  if (fallbackKeeps) sentences.push(`${fallbackKeeps} kept by keyword fallback.`);
  return sentences.join(" ");
}
