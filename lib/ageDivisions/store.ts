import "server-only";

import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import type { ContentOrgId } from "@/lib/siteConfig";

import type { SpringLeagueTable } from "@/lib/admin/springCombined/save";

import { SPRING_LEAGUE_ORGS } from "@/lib/admin/springCombined/view";

import {
  clearSeasonDivisionAges as clearSeason,
  copyFromSeason as copySeason,
  getLeagueDefaults as readLeagueDefaults,
  getSeasonDivisionAges as readSeasonDivisionAges,
  saveLeagueDefaults as writeLeagueDefaults,
  saveSeasonDivisionAges as writeSeasonDivisionAges,
  saveSpringCombinedSeasons,
  springDivisionAgesLockKey,
  undoSpringCombinedSeasons,
  type DivisionAgeDb,
  type SpringCombinedWriteOptions,
  type LeagueDefaultsRow,
  type SpringCombinedDb,
} from "./persistence";
import type { DivisionAgeConfig, LeagueAgeRule } from "./types";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

type DivisionAgeClient = Pick<Prisma.TransactionClient, "leagueAgeDivisionDefaults" | "seasonOrgSettings">;

function divisionAgeDb(client: DivisionAgeClient): DivisionAgeDb {
  return {
    findLeagueDefaults(organizationId) {
      return client.leagueAgeDivisionDefaults.findUnique({ where: { organizationId } });
    },
    async saveLeagueDefaults(input): Promise<LeagueDefaultsRow> {
      const row = await client.leagueAgeDivisionDefaults.upsert({
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
      const row = await client.seasonOrgSettings.findUnique({
        where: { organizationId_seasonYear: { organizationId, seasonYear } },
        select: { divisionAgesJson: true },
      });
      return row?.divisionAgesJson ?? null;
    },
    async saveSeasonDivisionAges(organizationId, seasonYear, divisionAgesJson) {
      const stored = divisionAgesJson == null ? Prisma.DbNull : toJson(divisionAgesJson);
      await client.seasonOrgSettings.upsert({
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
}

const db = divisionAgeDb(prisma);

function writesSpringLeague(org: string): boolean {
  return (SPRING_LEAGUE_ORGS as readonly string[]).includes(org);
}

/** Held until the transaction ends, including when the season row does not exist yet. */
async function lockSpringDivisionAges(tx: Prisma.TransactionClient, seasonYear: number) {
  const key = springDivisionAgesLockKey(seasonYear);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
}

function withSpringSeasonLock<T>(org: string, seasonYear: number, run: (locked: DivisionAgeDb) => Promise<T>): Promise<T> {
  if (!writesSpringLeague(org)) return run(db);
  return prisma.$transaction(async (tx) => {
    await lockSpringDivisionAges(tx, seasonYear);
    return run(divisionAgeDb(tx));
  });
}

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
  baselineToken?: string,
) {
  return withSpringSeasonLock(org, seasonYear, (locked) =>
    writeSeasonDivisionAges(locked, org, seasonYear, input, adminId, { baselineToken }),
  );
}

export function clearSeasonDivisionAges(org: ContentOrgId, seasonYear: number, adminId: string, baselineToken?: string) {
  return withSpringSeasonLock(org, seasonYear, (locked) => clearSeason(locked, org, seasonYear, adminId, baselineToken));
}

export function copyFromSeason(
  org: ContentOrgId,
  fromYear: number,
  toYear: number,
  adminId: string,
  baselineToken?: string,
) {
  return withSpringSeasonLock(org, toYear, (locked) =>
    copySeason(locked, org, fromYear, toYear, adminId, undefined, baselineToken),
  );
}

const springDb: SpringCombinedDb = {
  transaction(run) {
    return prisma.$transaction((tx) =>
      run({
        lockSpringDivisionAges(seasonYear) {
          return lockSpringDivisionAges(tx, seasonYear);
        },
        async findSeasonDivisionAges(organizationId, seasonYear) {
          const row = await tx.seasonOrgSettings.findUnique({
            where: { organizationId_seasonYear: { organizationId, seasonYear } },
            select: { divisionAgesJson: true },
          });
          return row?.divisionAgesJson ?? null;
        },
        async saveSeasonDivisionAges(organizationId, seasonYear, divisionAgesJson) {
          const stored = divisionAgesJson == null ? Prisma.DbNull : toJson(divisionAgesJson);
          await tx.seasonOrgSettings.upsert({
            where: { organizationId_seasonYear: { organizationId, seasonYear } },
            create: { organizationId, seasonYear, divisionAgesJson: stored },
            update: { divisionAgesJson: stored },
          });
        },
      }),
    );
  },
};

export function saveSpringCombinedDivisionAges(
  seasonYear: number,
  proposed: { cutoff: LeagueAgeRule; divisions: DivisionAgeConfig[] },
  leagues: readonly SpringLeagueTable[],
  adminId: string,
  options?: SpringCombinedWriteOptions,
) {
  return saveSpringCombinedSeasons(springDb, seasonYear, proposed, leagues, adminId, options);
}

export function undoSpringCombinedDivisionAges(
  seasonYear: number,
  adminId: string,
  options?: SpringCombinedWriteOptions,
) {
  return undoSpringCombinedSeasons(springDb, seasonYear, adminId, options);
}
