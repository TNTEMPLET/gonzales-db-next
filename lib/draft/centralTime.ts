/**
 * The league schedules everything in Central time (America/Chicago), which
 * observes DST -- there's no per-org timezone concept anywhere else in this
 * app, so this is a narrow, draft-specific utility rather than a general
 * timezone library. No date library is installed; both directions use the
 * standard Intl-based double-conversion trick, which is DST-correct without
 * one.
 */

const CENTRAL_TZ = "America/Chicago";

/**
 * Converts a `<input type="datetime-local">` value (e.g. "2026-09-10T18:00",
 * always interpreted as Central time) into the real UTC instant it names.
 */
export function parseCentralDateTimeToUtc(localValue: string): Date | null {
  if (!localValue) return null;
  const naiveUtcGuess = new Date(`${localValue}:00.000Z`);
  if (Number.isNaN(naiveUtcGuess.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(naiveUtcGuess)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  const offsetMs = naiveUtcGuess.getTime() - wallClockAsUtc;
  return new Date(naiveUtcGuess.getTime() + offsetMs);
}

/** Formats a UTC instant as Central time, e.g. "Tue, Sep 10, 2026, 6:00 PM CDT". */
export function formatCentralDateTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

/** Formats a UTC instant back into a `<input type="datetime-local">` value, in Central time. */
export function toCentralDateTimeLocalValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}
