/**
 * Client-safe sample Player Cards for UI preview (not persisted).
 */
import { buildPlayerChecks, computePlayerReadiness } from "./readiness";
import { summarizePlayerChecks } from "./readiness";
import type { PlayerCardView } from "./types";
import { playerCardFromFields } from "./playerCardFromFields";

export type DemoPlayerVariant = "ready" | "incomplete" | "blocked";

const TEAM = {
  id: "demo-team",
  teamName: "Demo Tigers",
  ageGroup: "10U",
};

function basePlayer(variant: DemoPlayerVariant) {
  if (variant === "ready") {
    return {
      id: "demo-player-ready",
      fullName: "Alex Demo (Ready)",
      firstName: "Alex",
      lastName: "Demo",
      jerseyNumber: "7",
      jerseySize: "Youth Medium",
      rosterStatus: "ACTIVE",
      birthDate: "2015-06-01T00:00:00.000Z",
      gender: "M",
      guardianFirstName: "Pat",
      guardianLastName: "Parent",
      guardianEmail: "parent.demo@example.com",
      guardianPhone: "225-555-0100",
      contactPhone: null as string | null,
      paymentStatus: "PAID",
      birthCertificateStatus: "ON_FILE",
      medicalTreatmentAuthorized: true,
      liabilityWaiverAccepted: true,
      codeOfConductAccepted: true,
      refundPolicyAccepted: true,
    };
  }
  if (variant === "blocked") {
    return {
      id: "demo-player-blocked",
      fullName: "Blake Demo (Dropped)",
      firstName: "Blake",
      lastName: "Demo",
      jerseyNumber: "12",
      jerseySize: null as string | null,
      rosterStatus: "DROPPED",
      birthDate: null as string | null,
      gender: null as string | null,
      guardianFirstName: "Sam",
      guardianLastName: "Guardian",
      guardianEmail: "sam.demo@example.com",
      guardianPhone: "225-555-0199",
      contactPhone: null as string | null,
      paymentStatus: "PAID",
      birthCertificateStatus: "ON_FILE",
      medicalTreatmentAuthorized: true,
      liabilityWaiverAccepted: true,
      codeOfConductAccepted: true,
      refundPolicyAccepted: true,
    };
  }
  // incomplete — missing payment, birth cert, waivers
  return {
    id: "demo-player-incomplete",
    fullName: "Casey Demo (Incomplete)",
    firstName: "Casey",
    lastName: "Demo",
    jerseyNumber: "3",
    jerseySize: "Youth Small",
    rosterStatus: "ACTIVE",
    birthDate: "2016-03-12T00:00:00.000Z",
    gender: "F",
    guardianFirstName: "Jordan",
    guardianLastName: "Parent",
    guardianEmail: null as string | null,
    guardianPhone: null as string | null,
    contactPhone: null as string | null,
    paymentStatus: null as string | null,
    birthCertificateStatus: null as string | null,
    medicalTreatmentAuthorized: false,
    liabilityWaiverAccepted: false,
    codeOfConductAccepted: false,
    refundPolicyAccepted: false,
  };
}

export function buildDemoPlayerCard(
  variant: DemoPlayerVariant,
  opts: { organizationId: string; seasonYear: number },
): PlayerCardView {
  const player = basePlayer(variant);
  const checks = buildPlayerChecks(player);
  const summary = summarizePlayerChecks(checks);
  const readiness = computePlayerReadiness(player);
  return playerCardFromFields(
    player,
    {
      ...TEAM,
      seasonYear: opts.seasonYear,
      organizationId: opts.organizationId,
    },
    checks,
    readiness,
    summary.completeCount,
    summary.total,
  );
}

export function buildDemoPlayerCards(opts: {
  organizationId: string;
  seasonYear: number;
}): PlayerCardView[] {
  return [
    buildDemoPlayerCard("ready", opts),
    buildDemoPlayerCard("incomplete", opts),
    buildDemoPlayerCard("blocked", opts),
  ];
}
