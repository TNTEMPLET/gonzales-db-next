/**
 * Client-safe builder for PlayerCardView from field bags (forms + demos).
 */
import type { PlayerCardView } from "./types";

export function playerCardFromFields(
  player: {
    id: string;
    fullName: string;
    firstName?: string | null;
    lastName?: string | null;
    jerseyNumber?: string | null;
    jerseySize?: string | null;
    rosterStatus?: string | null;
    birthDate?: string | null;
    gender?: string | null;
    allStarAgeBand?: string | null;
    guardianFirstName?: string | null;
    guardianLastName?: string | null;
    guardianEmail?: string | null;
    guardianPhone?: string | null;
    contactPhone?: string | null;
    paymentStatus?: string | null;
    birthCertificateStatus?: string | null;
    registrationOrderNo?: string | null;
    registrationOrderDate?: string | null;
    streetAddress?: string | null;
    unit?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    medicalConditionsSummary?: string | null;
    medicalConditionsDetails?: string | null;
    medicalTreatmentAuthorized?: boolean | null;
    liabilityWaiverAccepted?: boolean | null;
    codeOfConductAccepted?: boolean | null;
    refundPolicyAccepted?: boolean | null;
  },
  team: {
    id: string;
    teamName: string;
    ageGroup: string;
    seasonYear: number;
    organizationId: string;
  },
  checks: PlayerCardView["checks"],
  readiness: PlayerCardView["readiness"],
  completeCount: number,
  totalRequired: number,
): PlayerCardView {
  const now = new Date().toISOString();
  return {
    id: player.id,
    organizationId: team.organizationId,
    seasonYear: team.seasonYear,
    readiness,
    checks,
    completeCount,
    totalRequired,
    firstName: player.firstName ?? null,
    lastName: player.lastName ?? null,
    fullName: player.fullName,
    jerseyNumber: player.jerseyNumber ?? null,
    jerseySize: player.jerseySize ?? null,
    rosterStatus: player.rosterStatus ?? null,
    birthDate: player.birthDate ?? null,
    gender: player.gender ?? null,
    allStarAgeBand: player.allStarAgeBand ?? null,
    guardianFirstName: player.guardianFirstName ?? null,
    guardianLastName: player.guardianLastName ?? null,
    guardianEmail: player.guardianEmail ?? null,
    guardianPhone: player.guardianPhone ?? null,
    contactPhone: player.contactPhone ?? null,
    paymentStatus: player.paymentStatus ?? null,
    birthCertificateStatus: player.birthCertificateStatus ?? null,
    registrationOrderNo: player.registrationOrderNo ?? null,
    registrationOrderDate: player.registrationOrderDate ?? null,
    streetAddress: player.streetAddress ?? null,
    unit: player.unit ?? null,
    city: player.city ?? null,
    state: player.state ?? null,
    postalCode: player.postalCode ?? null,
    medicalConditionsSummary: player.medicalConditionsSummary ?? null,
    medicalConditionsDetails: player.medicalConditionsDetails ?? null,
    medicalTreatmentAuthorized: player.medicalTreatmentAuthorized ?? null,
    liabilityWaiverAccepted: player.liabilityWaiverAccepted ?? null,
    codeOfConductAccepted: player.codeOfConductAccepted ?? null,
    refundPolicyAccepted: player.refundPolicyAccepted ?? null,
    team: {
      id: team.id,
      teamName: team.teamName,
      ageGroup: team.ageGroup,
      seasonYear: team.seasonYear,
    },
    createdAt: now,
    updatedAt: now,
  };
}
