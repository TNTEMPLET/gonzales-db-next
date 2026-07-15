import "server-only";

import type { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

import type {
  SportsConnectMappingPresetView,
  SportsConnectReportKind,
} from "./types";
import { isSportsConnectReportKind } from "./types";

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (v != null) out[k] = String(v);
  }
  return out;
}

export function mapPresetRow(row: {
  id: string;
  organizationId: string;
  seasonYear: number;
  name: string;
  reportKind: string;
  divisionMapping: Prisma.JsonValue;
  teamMapping: Prisma.JsonValue;
  columnOverrides: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): SportsConnectMappingPresetView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    seasonYear: row.seasonYear,
    name: row.name,
    reportKind: isSportsConnectReportKind(row.reportKind)
      ? row.reportKind
      : "PLAYER_REG",
    divisionMapping: asStringRecord(row.divisionMapping),
    teamMapping: asStringRecord(row.teamMapping),
    columnOverrides: row.columnOverrides
      ? asStringRecord(row.columnOverrides)
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listMappingPresets(input: {
  organizationId: string;
  seasonYear?: number;
  reportKind?: SportsConnectReportKind;
}): Promise<SportsConnectMappingPresetView[]> {
  const rows = await prisma.sportsConnectMappingPreset.findMany({
    where: {
      organizationId: input.organizationId,
      seasonYear: input.seasonYear,
      reportKind: input.reportKind,
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map(mapPresetRow);
}

export async function getMappingPreset(
  id: string,
  organizationId: string,
): Promise<SportsConnectMappingPresetView | null> {
  const row = await prisma.sportsConnectMappingPreset.findFirst({
    where: { id, organizationId },
  });
  return row ? mapPresetRow(row) : null;
}

export async function upsertMappingPreset(input: {
  organizationId: string;
  seasonYear: number;
  name: string;
  reportKind: SportsConnectReportKind;
  divisionMapping: Record<string, string>;
  teamMapping: Record<string, string>;
  columnOverrides?: Record<string, string> | null;
  createdByAdminId?: string | null;
}): Promise<SportsConnectMappingPresetView> {
  const name = input.name.trim() || "Default";
  const row = await prisma.sportsConnectMappingPreset.upsert({
    where: {
      organizationId_seasonYear_name_reportKind: {
        organizationId: input.organizationId,
        seasonYear: input.seasonYear,
        name,
        reportKind: input.reportKind,
      },
    },
    create: {
      organizationId: input.organizationId,
      seasonYear: input.seasonYear,
      name,
      reportKind: input.reportKind,
      divisionMapping: input.divisionMapping,
      teamMapping: input.teamMapping,
      columnOverrides: input.columnOverrides ?? undefined,
      createdByAdminId: input.createdByAdminId ?? undefined,
    },
    update: {
      divisionMapping: input.divisionMapping,
      teamMapping: input.teamMapping,
      columnOverrides: input.columnOverrides ?? undefined,
    },
  });
  return mapPresetRow(row);
}

export async function deleteMappingPreset(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const existing = await prisma.sportsConnectMappingPreset.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.sportsConnectMappingPreset.delete({ where: { id } });
  return true;
}
