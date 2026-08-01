import type { ContentOrgId } from "@/lib/siteConfig";

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
function chicagoDateTimeParts(date: Date): string {
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

type RegistrationWindow = {
  /** Inclusive start, America/Chicago wall time: YYYY-MM-DDTHH:mm:ss */
  startLocal: string;
  /** Inclusive end, America/Chicago wall time: YYYY-MM-DDTHH:mm:ss */
  endLocal: string;
};

/**
 * Per-org registration open windows (America/Chicago).
 * Fall Ball 2026: opens midnight Aug 1 through end of season Nov 30.
 * Spring orgs: historical winter window (Dec 20 – Jan 1).
 */
const WINDOWS: Record<ContentOrgId, RegistrationWindow> = {
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

/**
 * Whether the registration period is currently open for the given org
 * (or this deployment's SITE_ORG when omitted).
 */
export function isRegistrationOpen(org?: ContentOrgId | string | null): boolean {
  const contentOrg = resolveContentOrg(org);
  const regWindow = WINDOWS[contentOrg];
  const nowLocal = chicagoDateTimeParts(new Date());
  return nowLocal >= regWindow.startLocal && nowLocal <= regWindow.endLocal;
}
