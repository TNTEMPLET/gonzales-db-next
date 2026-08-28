/** Pure helpers for registration window local datetimes (no Prisma / server-only). */

const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export function isValidRegistrationLocal(value: string): boolean {
  if (!LOCAL_DATETIME_RE.test(value)) return false;
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ss] = timePart.split(":").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (hh > 23 || mm > 59 || ss > 59) return false;
  if (y < 2020 || y > 2100) return false;
  return true;
}

/** Convert stored local `YYYY-MM-DDTHH:mm:ss` → `datetime-local` input value (no seconds). */
export function toDatetimeLocalInput(local: string): string {
  if (local.length >= 16) return local.slice(0, 16);
  return local;
}

/** Convert `datetime-local` value (`YYYY-MM-DDTHH:mm`) → stored local with seconds. */
export function fromDatetimeLocalInput(value: string): string {
  const trimmed = value.trim();
  if (LOCAL_DATETIME_RE.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}
