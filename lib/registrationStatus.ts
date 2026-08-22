import type { ContentOrgId } from "@/lib/siteConfig";
import prisma from "@/lib/prisma";
import {
  fromDatetimeLocalInput,
  isValidRegistrationLocal,
  toDatetimeLocalInput,
} from "@/lib/registrationWindowFormat";

export {
  fromDatetimeLocalInput,
  isValidRegistrationLocal,
  toDatetimeLocalInput,
} from "@/lib/registrationWindowFormat";

const CENTRAL_TZ = "America/Chicago";

/**
 * Resolve content org for registration windows.
 * Prefer an explicit org; otherwise use SITE_ORG for this deployment.
 */
function resolveContentOrg(org?: ContentOrgId | string | null): ContentOrgId {
  if (org === "fallball" || org === "ascension" || org === "gonzales") {
    return org;
  }
  const raw = (process.env.SITE_ORG ?? "gonzales").toLowerCase();
  if (raw === "fallball") return "fallball";
  if (raw === "ascension") return "ascension";
  return "gonzales";
}

/**
 * Format a Date as YYYY-MM-DDTHH:mm:ss in America/Chicago (no offset suffix).
 * Used for lexical compare against local window bounds.
 */
export function chicagoDateTimeParts(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/**
 * Stored/settable registration mode (Master Admin override).
 * AUTO_SCHEDULED defers to the start/end window; the other three force a
 * fixed public status regardless of the window dates. Mirrors the Prisma
 * `RegistrationMode` enum on OrgRegistrationWindow.
 */
export type RegistrationModeSetting =
  | "AUTO_SCHEDULED"
  | "OPEN"
  | "WAITLIST"
  | "CLOSED";

const REGISTRATION_MODE_SETTINGS: readonly RegistrationModeSetting[] = [
  "AUTO_SCHEDULED",
  "OPEN",
  "WAITLIST",
  "CLOSED",
];

export function isValidRegistrationMode(
  value: unknown,
): value is RegistrationModeSetting {
  return (
    typeof value === "string" &&
    (REGISTRATION_MODE_SETTINGS as readonly string[]).includes(value)
  );
}

/** Resolved effective status shown to the public site. */
export type RegistrationStatus = "OPEN" | "WAITLIST" | "CLOSED";

export type RegistrationWindow = {
  /** Inclusive start, America/Chicago wall time: YYYY-MM-DDTHH:mm:ss */
  startLocal: string;
  /** Inclusive end, America/Chicago wall time: YYYY-MM-DDTHH:mm:ss */
  endLocal: string;
  /** Master Admin mode override; AUTO_SCHEDULED defers to the window above. */
  mode: RegistrationModeSetting;
  /** True when values came from OrgRegistrationWindow (vs code defaults). */
  source: "database" | "default";
};

/**
 * Fallback windows when no Master Admin row exists yet (or DB is unreachable).
 * Prefer editing via Master Admin → Registration Windows so deploys are not required.
 *
 * CRITICAL: fallball.mode must stay "WAITLIST" — regular registration is closed
 * and public pages must keep showing the APBaseball.com waitlist, not reopen.
 */
export const DEFAULT_REGISTRATION_WINDOWS: Record<
  ContentOrgId,
  Omit<RegistrationWindow, "source">
> = {
  fallball: {
    startLocal: "2026-08-01T00:00:00",
    endLocal: "2026-08-01T23:59:59",
    mode: "WAITLIST",
  },
  gonzales: {
    startLocal: "2025-12-20T00:00:00",
    endLocal: "2026-01-01T23:59:59",
    mode: "AUTO_SCHEDULED",
  },
  ascension: {
    startLocal: "2025-12-20T00:00:00",
    endLocal: "2026-01-01T23:59:59",
    mode: "AUTO_SCHEDULED",
  },
};

export function isRegistrationWindowOpen(
  window: Pick<RegistrationWindow, "startLocal" | "endLocal">,
  now: Date = new Date(),
): boolean {
  const nowLocal = chicagoDateTimeParts(now);
  return nowLocal >= window.startLocal && nowLocal <= window.endLocal;
}

/**
 * Load the registration window + mode for an org (DB override or code default).
 */
export async function getRegistrationWindow(
  org?: ContentOrgId | string | null,
): Promise<RegistrationWindow> {
  const contentOrg = resolveContentOrg(org);
  const fallback: RegistrationWindow = {
    ...DEFAULT_REGISTRATION_WINDOWS[contentOrg],
    source: "default",
  };

  try {
    const row = await prisma.orgRegistrationWindow.findUnique({
      where: { organizationId: contentOrg },
      select: { startLocal: true, endLocal: true, mode: true },
    });

    if (
      row &&
      isValidRegistrationLocal(row.startLocal) &&
      isValidRegistrationLocal(row.endLocal)
    ) {
      return {
        startLocal: row.startLocal,
        endLocal: row.endLocal,
        mode: isValidRegistrationMode(row.mode) ? row.mode : "AUTO_SCHEDULED",
        source: "database",
      };
    }
  } catch (err) {
    // Table/column may not exist until migrate deploy — keep public sites up on defaults.
    console.error(
      `getRegistrationWindow(${contentOrg}) failed; using defaults:`,
      err instanceof Error ? err.message : err,
    );
  }

  return fallback;
}

/**
 * Resolve the effective public status from a window's mode + dates.
 * Pure/sync so API routes can reuse it without a second DB round trip.
 */
export function resolveRegistrationStatus(
  window: Pick<RegistrationWindow, "mode" | "startLocal" | "endLocal">,
): RegistrationStatus {
  if (window.mode === "OPEN") return "OPEN";
  if (window.mode === "WAITLIST") return "WAITLIST";
  if (window.mode === "CLOSED") return "CLOSED";
  // AUTO_SCHEDULED: fall back to the legacy start/end window comparison.
  return isRegistrationWindowOpen(window) ? "OPEN" : "CLOSED";
}

/**
 * Effective public registration status for the given org (or this
 * deployment's SITE_ORG when omitted): OPEN, WAITLIST, or CLOSED.
 * Reads Master Admin–managed OrgRegistrationWindow (mode override or
 * scheduled window) when present, else code defaults.
 */
export async function getRegistrationStatus(
  org?: ContentOrgId | string | null,
): Promise<RegistrationStatus> {
  const window = await getRegistrationWindow(org);
  return resolveRegistrationStatus(window);
}

/**
 * Whether the registration period is currently open for the given org
 * (or this deployment's SITE_ORG when omitted).
 * Reads Master Admin–managed OrgRegistrationWindow when present.
 * @deprecated Prefer `getRegistrationStatus`, which also honors mode
 * overrides (OPEN/WAITLIST/CLOSED) instead of only the scheduled window.
 */
export async function isRegistrationOpen(
  org?: ContentOrgId | string | null,
): Promise<boolean> {
  const window = await getRegistrationWindow(org);
  return isRegistrationWindowOpen(window);
}

