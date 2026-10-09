import { leagueCalendarDate } from "@/lib/seasonConfig";
import type { ContentOrgId } from "@/lib/siteConfig";

export const SEASON_MODES = ["OFF_SEASON", "PRESEASON", "IN_SEASON", "POSTSEASON"] as const;

export type SeasonMode = (typeof SEASON_MODES)[number];

export type SeasonModeSource = "override" | "calendar";

/** Days after the last game day that still count as postseason. */
export const POSTSEASON_DAYS = 45;

export const SEASON_MODE_LABELS: Record<SeasonMode, string> = {
  OFF_SEASON: "Off season",
  PRESEASON: "Preseason",
  IN_SEASON: "In season",
  POSTSEASON: "Postseason",
};

/** Off season and preseason use Season Setup as the admin home. */
export function isSetupSeasonMode(mode: SeasonMode | null | undefined): boolean {
  return mode === "OFF_SEASON" || mode === "PRESEASON";
}

export type SeasonModeInput = {
  asOf?: Date;
  /** Inclusive first game day, YYYY-MM-DD. */
  seasonStart: string;
  /** Inclusive last game day, YYYY-MM-DD. */
  seasonEnd: string;
  /** Registration window start. A datetime uses its calendar date only. */
  registrationStart?: string | null;
  /** Registration window end. A datetime uses its calendar date only. */
  registrationEnd?: string | null;
  /** Master-admin override. Null, blank, and unknown values are ignored. */
  override?: string | null;
};

export type SeasonModeResult = {
  mode: SeasonMode;
  source: SeasonModeSource;
};

export type SeasonModeSnapshot = {
  organizationId: ContentOrgId;
  seasonYear: number;
  mode: SeasonMode;
  automatic: SeasonMode;
  source: SeasonModeSource;
  override: SeasonMode | null;
  storageReady: boolean;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isSeasonMode(value: unknown): value is SeasonMode {
  return typeof value === "string" && (SEASON_MODES as readonly string[]).includes(value);
}

function calendarDate(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE.exec(value.trim().slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function registrationWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): { start: string; end: string } | null {
  const startDate = calendarDate(start);
  const endDate = calendarDate(end);
  if (!startDate || !endDate || endDate < startDate) return null;
  return { start: startDate, end: endDate };
}

/**
 * Season phase for one league.
 *
 * A saved override wins. Otherwise, in order: inside the game dates, inside
 * the registration window (and outside the game dates), within 45 days after
 * the last game day, the setup gap after registration opens and before
 * opening day, then off season.
 *
 * Dates are America/Chicago calendar days. Registration clock times are ignored.
 */
export function resolveSeasonMode(input: SeasonModeInput): SeasonModeResult {
  const override = typeof input.override === "string" ? input.override.trim() : null;
  if (isSeasonMode(override)) {
    return { mode: override, source: "override" };
  }

  const today = leagueCalendarDate(input.asOf ?? new Date());
  const seasonStart = calendarDate(input.seasonStart);
  const seasonEnd = calendarDate(input.seasonEnd);
  if (!seasonStart || !seasonEnd || seasonEnd < seasonStart) {
    return { mode: "OFF_SEASON", source: "calendar" };
  }

  if (today >= seasonStart && today <= seasonEnd) {
    return { mode: "IN_SEASON", source: "calendar" };
  }

  const registration = registrationWindow(input.registrationStart, input.registrationEnd);
  if (registration && today >= registration.start && today <= registration.end) {
    return { mode: "PRESEASON", source: "calendar" };
  }

  if (today > seasonEnd && today <= addCalendarDays(seasonEnd, POSTSEASON_DAYS)) {
    return { mode: "POSTSEASON", source: "calendar" };
  }

  if (registration && today < seasonStart && today >= registration.start) {
    return { mode: "PRESEASON", source: "calendar" };
  }

  return { mode: "OFF_SEASON", source: "calendar" };
}

/**
 * Read a stored override. A missing column or any other read failure leaves
 * the override unset so the caller can keep the calculated mode.
 */
export async function settleSeasonModeOverride(
  read: () => Promise<string | null>,
): Promise<{ override: string | null; storageReady: boolean }> {
  try {
    const override = await read();
    return { override: override ?? null, storageReady: true };
  } catch (err) {
    console.error(
      "Season mode override could not be read; using the calculated mode.",
      err instanceof Error ? err.message : err,
    );
    return { override: null, storageReady: false };
  }
}
