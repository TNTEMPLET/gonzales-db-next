/**
 * Fall Ball playing age: age as of April 30 of the following year (e.g. for
 * seasonYear 2026, cutoff is 2027-04-30). Returns null if birthDate is
 * missing/unparseable.
 */
export function computePlayingAge(
  birthDate: string | Date | null | undefined,
  seasonYear: number
): number | null {
  if (!birthDate) return null;
  const birth = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  if (Number.isNaN(birth.getTime())) return null;

  const cutoff = new Date(Date.UTC(seasonYear + 1, 3, 30)); // April is month index 3
  let age = cutoff.getUTCFullYear() - birth.getUTCFullYear();
  const birthMonthDayAfterCutoff =
    birth.getUTCMonth() > cutoff.getUTCMonth() ||
    (birth.getUTCMonth() === cutoff.getUTCMonth() && birth.getUTCDate() > cutoff.getUTCDate());
  if (birthMonthDayAfterCutoff) age -= 1;
  return age;
}
