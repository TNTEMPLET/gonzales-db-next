import type { Page } from "playwright";

/** gc-writer must run Playwright with this timezone so form times match bracket Central labels. */
export const GC_WRITER_TIMEZONE = "America/Chicago";

/** CDT offset when converting Central wall clock → true UTC (scoreboard start_ts). */
const CENTRAL_TO_UTC_OFFSET_HOURS = 5;

const GC_FORM_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{2})$/;
const GC_FORM_TIME_RE = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

export function parseGcFormDateParts(gcFormDate: string): { year: number; month: number; day: number } | null {
  const match = gcFormDate.trim().match(GC_FORM_DATE_RE);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = 2000 + Number(match[3]);
  return { year, month, day };
}

export function parseGcFormTimeParts(gcFormTime: string): { hours24: number; minutes: number } | null {
  const match = gcFormTime.trim().match(GC_FORM_TIME_RE);
  if (!match) return null;
  let hours24 = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]!.toUpperCase();
  if (meridiem === "PM" && hours24 !== 12) hours24 += 12;
  if (meridiem === "AM" && hours24 === 12) hours24 = 0;
  return { hours24, minutes };
}

/** Expected scoreboard start_ts for gc-writer form entry (America/Chicago browser). */
export function expectedUtcFromGcForm(gcFormDate: string, gcFormTime: string): string | null {
  const dateParts = parseGcFormDateParts(gcFormDate);
  const timeParts = parseGcFormTimeParts(gcFormTime);
  if (!dateParts || !timeParts) return null;
  const instant = new Date(
    Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      timeParts.hours24 + CENTRAL_TO_UTC_OFFSET_HOURS,
      timeParts.minutes,
      0,
    ),
  );
  return instant.toISOString();
}

export function assertScheduledForMatchesGcForm(
  scheduledForIso: string,
  gcFormDate: string,
  gcFormTime: string,
): void {
  const expected = expectedUtcFromGcForm(gcFormDate, gcFormTime);
  if (!expected) {
    throw new Error(`Invalid gcFormDate/gcFormTime (${gcFormDate} ${gcFormTime}).`);
  }
  const actual = new Date(scheduledForIso).toISOString();
  if (actual !== expected) {
    throw new Error(
      `scheduledFor does not match gcForm schedule (form ${gcFormDate} ${gcFormTime} → ${expected}, scheduledFor ${actual}).`,
    );
  }
}

export function assertStartTsMatchesExpected(expectedIso: string, actualIso: string): void {
  const expected = new Date(expectedIso).toISOString();
  const actual = new Date(actualIso).toISOString();
  if (actual !== expected) {
    throw new Error(
      `GameChanger saved the wrong start time (expected ${expected}, got ${actual}). Writer timezone regression.`,
    );
  }
}

export async function assertWriterBrowserTimezone(page: Page): Promise<void> {
  const containerTz = process.env.TZ?.trim();
  if (containerTz && containerTz !== GC_WRITER_TIMEZONE) {
    throw new Error(`Container TZ must be ${GC_WRITER_TIMEZONE}, got ${containerTz}.`);
  }

  const browserTz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (browserTz !== GC_WRITER_TIMEZONE) {
    throw new Error(
      `Playwright browser timezone must be ${GC_WRITER_TIMEZONE}, got ${browserTz}. Game times will be wrong.`,
    );
  }
}
