import "server-only";

import prisma from "@/lib/prisma";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import type { ContentOrgId } from "@/lib/siteConfig";

import { toPublicPlayerCard } from "./privacy";
import { buildPlayerChecks, computePlayerReadiness, summarizePlayerChecks } from "./readiness";
import type { PlayerCardAudience, PlayerCardView } from "./types";

const playerCardInclude = {
  team: {
    select: {
      id: true,
      organizationId: true,
      seasonYear: true,
      ageGroup: true,
      teamName: true,
    },
  },
} as const;

type PlayerWithTeam = {
  id: string;
  teamId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  contactPhone: string | null;
  gender: string | null;
  birthDate: Date | null;
  guardianFirstName: string | null;
  guardianLastName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  paymentStatus: string | null;
  birthCertificateStatus: string | null;
  registrationOrderNo: string | null;
  registrationOrderDate: Date | null;
  jerseySize: string | null;
  medicalConditionsSummary: string | null;
  medicalConditionsDetails: string | null;
  medicalTreatmentAuthorized: boolean | null;
  liabilityWaiverAccepted: boolean | null;
  codeOfConductAccepted: boolean | null;
  refundPolicyAccepted: boolean | null;
  streetAddress: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  rosterStatus: string | null;
  jerseyNumber: string | null;
  allStarAgeBand: string | null;
  createdAt: Date;
  updatedAt: Date;
  team: {
    id: string;
    organizationId: string;
    seasonYear: number;
    ageGroup: string;
    teamName: string;
  };
};

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

export function mapTeamPlayerToCard(player: PlayerWithTeam): PlayerCardView {
  const fields = {
    guardianEmail: player.guardianEmail,
    guardianPhone: player.guardianPhone,
    contactPhone: player.contactPhone,
    paymentStatus: player.paymentStatus,
    birthCertificateStatus: player.birthCertificateStatus,
    liabilityWaiverAccepted: player.liabilityWaiverAccepted,
    codeOfConductAccepted: player.codeOfConductAccepted,
    refundPolicyAccepted: player.refundPolicyAccepted,
    medicalTreatmentAuthorized: player.medicalTreatmentAuthorized,
    rosterStatus: player.rosterStatus,
    teamId: player.teamId,
  };
  const checks = buildPlayerChecks(fields);
  const summary = summarizePlayerChecks(checks);
  const readiness = computePlayerReadiness(fields);

  return {
    id: player.id,
    organizationId: player.team.organizationId,
    seasonYear: player.team.seasonYear,
    readiness,
    checks,
    completeCount: summary.completeCount,
    totalRequired: summary.total,
    firstName: player.firstName,
    lastName: player.lastName,
    fullName: player.fullName,
    jerseyNumber: player.jerseyNumber,
    jerseySize: player.jerseySize,
    rosterStatus: player.rosterStatus,
    birthDate: toIso(player.birthDate),
    gender: player.gender,
    allStarAgeBand: player.allStarAgeBand,
    guardianFirstName: player.guardianFirstName,
    guardianLastName: player.guardianLastName,
    guardianEmail: player.guardianEmail,
    guardianPhone: player.guardianPhone,
    contactPhone: player.contactPhone,
    paymentStatus: player.paymentStatus,
    birthCertificateStatus: player.birthCertificateStatus,
    registrationOrderNo: player.registrationOrderNo,
    registrationOrderDate: toIso(player.registrationOrderDate),
    streetAddress: player.streetAddress,
    unit: player.unit,
    city: player.city,
    state: player.state,
    postalCode: player.postalCode,
    medicalConditionsSummary: player.medicalConditionsSummary,
    medicalConditionsDetails: player.medicalConditionsDetails,
    medicalTreatmentAuthorized: player.medicalTreatmentAuthorized,
    liabilityWaiverAccepted: player.liabilityWaiverAccepted,
    codeOfConductAccepted: player.codeOfConductAccepted,
    refundPolicyAccepted: player.refundPolicyAccepted,
    team: {
      id: player.team.id,
      teamName: player.team.teamName,
      ageGroup: player.team.ageGroup,
      seasonYear: player.team.seasonYear,
    },
    createdAt: player.createdAt.toISOString(),
    updatedAt: player.updatedAt.toISOString(),
  };
}

export async function getPlayerCard(
  playerId: string,
  organizationId: string,
  audience: PlayerCardAudience = "ADMIN",
): Promise<PlayerCardView | null> {
  const player = await prisma.teamPlayer.findFirst({
    where: {
      id: playerId,
      team: { organizationId },
    },
    include: playerCardInclude,
  });
  if (!player) return null;
  return toPublicPlayerCard(mapTeamPlayerToCard(player), audience);
}

export async function listPlayerCardsForTeam(
  teamId: string,
  organizationId: string,
  audience: PlayerCardAudience = "ADMIN",
): Promise<PlayerCardView[]> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId },
    select: { id: true },
  });
  if (!team) return [];

  const players = await prisma.teamPlayer.findMany({
    where: { teamId: team.id },
    include: playerCardInclude,
    orderBy: [{ fullName: "asc" }],
  });

  return players.map((p) => toPublicPlayerCard(mapTeamPlayerToCard(p), audience));
}

/**
 * List cards for a guardian by email match on TeamPlayer.guardianEmail.
 * Phase 2 will prefer PlayerGuardianLink; this path supports early parent portal prep.
 */
export async function listPlayerCardsForGuardian(input: {
  organizationId: string;
  registeredUserId: string;
  seasonYear?: number;
  audience?: PlayerCardAudience;
}): Promise<PlayerCardView[]> {
  const year =
    input.seasonYear ??
    getSeasonConfigForOrg(input.organizationId as ContentOrgId).year;
  const audience = input.audience ?? "GUARDIAN";

  // Global identity + org profile presence
  const prof = await (prisma as any).registeredUserOrgProfile.findUnique({
    where: {
      registeredUserId_organizationId: { registeredUserId: input.registeredUserId, organizationId: input.organizationId },
    },
    select: { registeredUserId: true },
  });
  if (!prof) return [];
  const user = await prisma.registeredUser.findUnique({
    where: { id: input.registeredUserId, isBlocked: false },
    select: { id: true, email: true },
  });
  if (!user?.email) return [];

  const players = await prisma.teamPlayer.findMany({
    where: {
      guardianEmail: { equals: user.email, mode: "insensitive" },
      team: {
        organizationId: input.organizationId,
        seasonYear: year,
      },
    },
    include: playerCardInclude,
    orderBy: [{ fullName: "asc" }],
  });

  return players.map((p) => toPublicPlayerCard(mapTeamPlayerToCard(p), audience));
}
