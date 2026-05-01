import crypto from "node:crypto";

import type { ContentOrgId } from "@/lib/siteConfig";

export function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function createInviteToken() {
  // 128-bit url-safe token (shorter than hex while still strong).
  return crypto.randomBytes(16).toString("base64url");
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
  title: string | null;
  status: string;
  accessMode: string;
  publishedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    publishedAt: row.publishedAt?.toISOString() || null,
    closedAt: row.closedAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
