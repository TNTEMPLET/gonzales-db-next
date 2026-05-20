import type { OrgAlert } from "@prisma/client";

import prisma from "@/lib/prisma";

export type OrgAlertRecord = {
  id: string;
  organizationId: string;
  allParksOut: boolean;
  venues: string[];
  expiresAt: Date;
  createdAt: Date;
};

export function parseOrgAlertVenues(venues: unknown): string[] {
  if (!Array.isArray(venues)) return [];
  return venues
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

function mapOrgAlert(row: OrgAlert): OrgAlertRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    allParksOut: row.allParksOut,
    venues: parseOrgAlertVenues(row.venues),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export async function getActiveOrgAlert(organizationId: string): Promise<OrgAlertRecord | null> {
  const row = await prisma.orgAlert.findFirst({
    where: {
      organizationId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  return row ? mapOrgAlert(row) : null;
}

export async function getAllActiveOrgAlerts(): Promise<OrgAlertRecord[]> {
  const rows = await prisma.orgAlert.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: [{ organizationId: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(mapOrgAlert);
}

export async function getRecentOrgAlerts(organizationId: string, limit = 5): Promise<OrgAlertRecord[]> {
  const rows = await prisma.orgAlert.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapOrgAlert);
}
