import type { ContentOrgId } from "@/lib/siteConfig";
import prisma from "@/lib/prisma";

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

export type RegistrationWindow = {
  /** Inclusive start, America/Chicago wall time: YYYY-MM-DDTHH:mm:ss */
  startLocal: string;
  /** Inclusive end, America/Chicago wall time: YYYY-MM-DDTHH:mm:ss */
  endLocal: string;
  /** True when values came from OrgRegistrationWindow (vs code defaults). */
  source: "database" | "default";
};

/**
 * Fallback windows when no Master Admin row exists yet (or DB is unreachable).
 * Prefer editing via Master Admin → Registration Windows so deploys are not required.
 */
export const DEFAULT_REGISTRATION_WINDOWS: Record<
  ContentOrgId,
  Omit<RegistrationWindow, "source">
> = {
  fallball: {
    startLocal: "2026-08-01T00:00:00",
    endLocal: "2026-11-30T23:59:59",
  },
  gonzales: {
    startLocal: "2025-12-20T00:00:00",
    endLocal: "2026-01-01T23:59:59",
  },
  ascension: {
    startLocal: "2025-12-20T00:00:00",
    endLocal: "2026-01-01T23:59:59",
  },
};

const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export function isValidRegistrationLocal(value: string): boolean {
  if (!LOCAL_DATETIME_RE.test(value)) return false;
  // Basic calendar sanity: reject impossible months/days via Date parse of parts
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ss] = timePart.split(":").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (hh > 23 || mm > 59 || ss > 59) return false;
  if (y < 2020 || y > 2100) return false;
  return true;
}

export function isRegistrationWindowOpen(
  window: Omit<RegistrationWindow, "source">,
  now: Date = new Date(),
): boolean {
  const nowLocal = chicagoDateTimeParts(now);
  return nowLocal >= window.startLocal && nowLocal <= window.endLocal;
}

/**
 * Load the registration window for an org (DB override or code default).
 */
export async function getRegistrationWindow(
  org?: ContentOrgId | string | null,
): Promise<RegistrationWindow> {
  const contentOrg = resolveContentOrg(org);
  const fallback = {
    ...DEFAULT_REGISTRATION_WINDOWS[contentOrg],
    source: "default" as const,
  };

  try {
    const row = await prisma.orgRegistrationWindow.findUnique({
      where: { organizationId: contentOrg },
      select: { startLocal: true, endLocal: true },
    });

    if (
      row &&
      isValidRegistrationLocal(row.startLocal) &&
      isValidRegistrationLocal(row.endLocal)
    ) {
      return {
        startLocal: row.startLocal,
        endLocal: row.endLocal,
        source: "database",
      };
    }
  } catch (err) {
    // Table may not exist until migrate deploy — keep public sites up on defaults.
    console.error(
      `getRegistrationWindow(${contentOrg}) failed; using defaults:`,
      err instanceof Error ? err.message : err,
    );
  }

  return fallback;
}

/**
 * Whether the registration period is currently open for the given org
 * (or this deployment's SITE_ORG when omitted).
 * Reads Master Admin–managed OrgRegistrationWindow when present.
 */
export async function isRegistrationOpen(
  org?: ContentOrgId | string | null,
): Promise<boolean> {
  const window = await getRegistrationWindow(org);
  return isRegistrationWindowOpen(window);
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
