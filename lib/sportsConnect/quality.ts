import "server-only";

import { isMissingGuardianContact, isMissingGuardianEmail } from "@/lib/players/completeness";
import { computePlayerReadiness } from "@/lib/players/readiness";
import prisma from "@/lib/prisma";

import type { RosterQualitySummary } from "./types";

/**
 * Org/season roster quality after SportsConnect loads.
 */
export async function getRosterQualitySummary(input: {
  organizationId: string;
  seasonYear: number;
}): Promise<RosterQualitySummary> {
  const teams = await prisma.team.findMany({
    where: {
      organizationId: input.organizationId,
      seasonYear: input.seasonYear,
    },
    select: {
      id: true,
      _count: {
        select: {
          players: true,
          coachAssignments: true,
        },
      },
      players: {
        select: {
          guardianEmail: true,
          guardianPhone: true,
          contactPhone: true,
          paymentStatus: true,
          birthCertificateStatus: true,
          liabilityWaiverAccepted: true,
          codeOfConductAccepted: true,
          refundPolicyAccepted: true,
          medicalTreatmentAuthorized: true,
          rosterStatus: true,
        },
      },
    },
  });

  let playerCount = 0;
  let teamsWithoutCoaches = 0;
  let teamsWithoutPlayers = 0;
  let playersMissingGuardianEmail = 0;
  let playersMissingGuardianContact = 0;
  let playersReady = 0;
  let playersIncomplete = 0;
  let playersBlocked = 0;

  for (const team of teams) {
    if (team._count.coachAssignments === 0) teamsWithoutCoaches += 1;
    if (team._count.players === 0) teamsWithoutPlayers += 1;
    for (const player of team.players) {
      playerCount += 1;
      if (isMissingGuardianEmail(player)) playersMissingGuardianEmail += 1;
      if (isMissingGuardianContact(player)) playersMissingGuardianContact += 1;
      const readiness = computePlayerReadiness(player);
      if (readiness === "READY") playersReady += 1;
      else if (readiness === "BLOCKED") playersBlocked += 1;
      else playersIncomplete += 1;
    }
  }

  const [lastPlayerImport, lastCoachImport] = await Promise.all([
    prisma.teamPlayerImportBatch.findFirst({
      where: {
        organizationId: input.organizationId,
        status: "DONE",
        undoneAt: null,
      },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true, createdAt: true },
    }),
    prisma.coachImportBatch.findFirst({
      where: {
        organizationId: input.organizationId,
        undoneAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return {
    organizationId: input.organizationId,
    seasonYear: input.seasonYear,
    teamCount: teams.length,
    playerCount,
    teamsWithoutCoaches,
    teamsWithoutPlayers,
    playersMissingGuardianEmail,
    playersMissingGuardianContact,
    playersReady,
    playersIncomplete,
    playersBlocked,
    lastPlayerImportAt:
      lastPlayerImport?.completedAt?.toISOString() ??
      lastPlayerImport?.createdAt?.toISOString() ??
      null,
    lastCoachImportAt: lastCoachImport?.createdAt?.toISOString() ?? null,
  };
}

/** Estimate missing guardian emails from raw import rows (preview). */
export function estimateMissingGuardianEmailFromRows(
  rows: Array<Record<string, unknown>>,
  emailKeys: readonly string[] = [
    "User Email",
    "Account Email",
    "Parent Email",
    "Guardian Email",
    "Email",
    "email",
  ],
): { total: number; missingGuardianEmail: number } {
  let missingGuardianEmail = 0;
  for (const row of rows) {
    let email = "";
    for (const key of emailKeys) {
      const value = row[key];
      if (value === undefined || value === null) continue;
      const parsed = String(value).trim();
      if (parsed) {
        email = parsed;
        break;
      }
    }
    if (!email) missingGuardianEmail += 1;
  }
  return { total: rows.length, missingGuardianEmail };
}
