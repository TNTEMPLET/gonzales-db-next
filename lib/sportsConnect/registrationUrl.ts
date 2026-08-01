import type { ContentOrgId } from "@/lib/siteConfig";

/**
 * Canonical public registration entry points for SportsConnect-backed programs.
 * Families register on SportsConnect / APBaseball.com — not on this platform.
 * There is no official public SC developer API; admins still export CSV/XLSX
 * for import into this app (see docs/sports-connect-integration-plan.md).
 *
 * Operator can override later if SC deep-links become available per program.
 */
export const SPORTS_CONNECT_REGISTRATION_URLS: Record<
  ContentOrgId,
  { label: string; href: string; notes: string }
> = {
  fallball: {
    label: "APBaseball.com (Fall Ball)",
    href: "https://www.apbaseball.com/Default.aspx?tabid=1467117",
    notes:
      "Fall Ball player registration and payment are managed in SportsConnect via APBaseball.com.",
  },
  gonzales: {
    label: "APBaseball.com",
    href: "https://www.apbaseball.com",
    notes:
      "When spring registration uses SportsConnect exports, families still register on APBaseball.com.",
  },
  ascension: {
    label: "APBaseball.com",
    href: "https://www.apbaseball.com",
    notes:
      "When spring registration uses SportsConnect exports, families still register on APBaseball.com.",
  },
};

export function getSportsConnectRegistrationUrl(org: ContentOrgId): {
  label: string;
  href: string;
  notes: string;
} {
  return SPORTS_CONNECT_REGISTRATION_URLS[org] ?? SPORTS_CONNECT_REGISTRATION_URLS.fallball;
}

/** Default family-facing registration link (Fall Ball / shared AP Baseball domain). */
export const DEFAULT_SPORTS_CONNECT_REGISTRATION_HREF =
  SPORTS_CONNECT_REGISTRATION_URLS.fallball.href;
