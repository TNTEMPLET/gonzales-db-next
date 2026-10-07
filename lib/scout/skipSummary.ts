/** Human-readable skip buckets, highest count first. */
export function formatScoutSkipCounts(counts: Record<string, number> | undefined): string {
  if (!counts) return "";
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => `${reason} ${count}`)
    .join(", ");
}

export function formatScoutSyncActivity(input: {
  created?: number;
  appended?: number;
  skipCounts?: Record<string, number>;
  fallbackKeeps?: number;
}): string | null {
  const bits: string[] = [];
  if (input.created) bits.push(`${input.created} new`);
  if (input.appended) bits.push(`${input.appended} updated`);
  const skips = formatScoutSkipCounts(input.skipCounts);
  if (skips) bits.push(`skipped ${skips}`);
  if (input.fallbackKeeps) bits.push(`${input.fallbackKeeps} kept by keyword fallback`);
  if (bits.length === 0) return null;
  return bits.join(", ");
}
