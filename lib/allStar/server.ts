import crypto from "node:crypto";

import type { ContentOrgId } from "@/lib/siteConfig";

export function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function createInviteToken() {
  // 128-bit url-safe token (shorter than hex while still strong).
  return crypto.randomBytes(16).toString("base64url");
}

/** Crockford base32 without I, L, O, U — easy to read and type (no 0/O/1/I confusion). */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Short code for the shared ballot URL only (`?t=`). Uniqueness enforced by DB + retry on conflict.
 * 9 characters ≈ 45 bits; fine for a non-guessable shared link with org + roster checks.
 */
export function createBallotLinkToken(length = 9) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CROCKFORD[bytes[i]! % 32]!;
  }
  return out;
}

export function parseSeasonYear(value: string | null | undefined) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null;
  return year;
}

export function parseContentOrg(value: string | null | undefined): ContentOrgId | null {
  if (value === "gonzales" || value === "ascension") return value;
  return null;
}

export function mapAllStarCycle(row: {
  id: string;
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
  allStarAgeGroupId: string | null;
  allStarAgeGroupLabel: string | null;
  title: string | null;
  hasShowcase: boolean;
  status: string;
  accessMode: string;
  publishedAt: Date | null;
  closedAt: Date | null;
  ballotLinkToken?: string | null;
  ballotLinkTokenHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const { ballotLinkTokenHash: _omitHash, ...rest } = row;
  void _omitHash;
  return {
    ...rest,
    publishedAt: row.publishedAt?.toISOString() || null,
    closedAt: row.closedAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
