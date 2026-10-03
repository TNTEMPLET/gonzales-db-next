import "server-only";

import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import type { ContentOrgId } from "@/lib/siteConfig";

import {
  clearSeasonDivisionAges as clearSeason,
  copyFromSeason as copySeason,
  getLeagueDefaults as readLeagueDefaults,
  getSeasonDivisionAges as readSeasonDivisionAges,
  saveLeagueDefaults as writeLeagueDefaults,
  saveSeasonDivisionAges as writeSeasonDivisionAges,
  type DivisionAgeDb,
  type LeagueDefaultsRow,
} from "./persistence";
import type { DivisionAgeConfig } from "./types";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

const db: DivisionAgeDb = {
  findLeagueDefaults(organizationId) {
    return prisma.leagueAgeDivisionDefaults.findUnique({ where: { organizationId } });
  },
  async saveLeagueDefaults(input): Promise<LeagueDefaultsRow> {
    const row = await prisma.leagueAgeDivisionDefaults.upsert({
      where: { organizationId: input.organizationId },
      create: {
        organizationId: input.organizationId,
        cutoffMonth: input.cutoffMonth,
        cutoffDay: input.cutoffDay,
        yearOffset: input.yearOffset,
        divisionsJson: toJson(input.divisionsJson),
        updatedByAdminId: input.updatedByAdminId,
      },
      update: {
        cutoffMonth: input.cutoffMonth,
        cutoffDay: input.cutoffDay,
        yearOffset: input.yearOffset,
        divisionsJson: toJson(input.divisionsJson),
        updatedByAdminId: input.updatedByAdminId,
      },
    });
    return row;
  },
  async findSeasonDivisionAges(organizationId, seasonYear) {
    const row = await prisma.seasonOrgSettings.findUnique({
      where: { organizationId_seasonYear: { organizationId, seasonYear } },
      select: { divisionAgesJson: true },
    });
    return row?.divisionAgesJson ?? null;
  },
  async saveSeasonDivisionAges(organizationId, seasonYear, divisionAgesJson) {
    const stored = divisionAgesJson == null ? Prisma.DbNull : toJson(divisionAgesJson);
    await prisma.seasonOrgSettings.upsert({
      where: { organizationId_seasonYear: { organizationId, seasonYear } },
      create: {
        organizationId,
        seasonYear,
        divisionAgesJson: stored,
      },
      update: {
        divisionAgesJson: stored,
      },
    });
  },
};

export function getLeagueDefaults(org: ContentOrgId) {
  return readLeagueDefaults(db, org);
}

export function saveLeagueDefaults(org: ContentOrgId, input: unknown, adminId: string) {
  return writeLeagueDefaults(db, org, input, adminId);
}

export function getSeasonDivisionAges(org: ContentOrgId, seasonYear: number) {
  return readSeasonDivisionAges(db, org, seasonYear);
}

export function saveSeasonDivisionAges(
  org: ContentOrgId,
  seasonYear: number,
  input: {
    cutoff: { cutoffMonth: number; cutoffDay: number; yearOffset: number };
    divisions: DivisionAgeConfig[];
    confirm: boolean;
  },
  adminId: string,
) {
  return writeSeasonDivisionAges(db, org, seasonYear, input, adminId);
}

export function clearSeasonDivisionAges(org: ContentOrgId, seasonYear: number, adminId: string) {
  return clearSeason(db, org, seasonYear, adminId);
}

export function copyFromSeason(org: ContentOrgId, fromYear: number, toYear: number, adminId: string) {
  return copySeason(db, org, fromYear, toYear, adminId);
}
