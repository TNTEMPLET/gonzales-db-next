/**
 * Client-safe player card types (no Prisma runtime imports).
 * TeamPlayer remains the roster source of truth; this is the card DTO layer.
 */

export const PLAYER_CHECK_KEYS = [
  "GUARDIAN_CONTACT",
  "PAYMENT",
  "BIRTH_CERTIFICATE",
  "LIABILITY_WAIVER",
  "CODE_OF_CONDUCT",
  "REFUND_POLICY",
  "MEDICAL_AUTH",
  "ROSTER_STATUS",
] as const;

export type PlayerCheckKey = (typeof PLAYER_CHECK_KEYS)[number];

export type PlayerReadiness = "READY" | "INCOMPLETE" | "BLOCKED";

export type PlayerCheckView = {
  key: PlayerCheckKey;
  label: string;
  ok: boolean;
  /** True when this check is required for READY. */
  required: boolean;
  detail: string | null;
};

export type PlayerCardAudience = "ADMIN" | "COACH" | "GUARDIAN";

export type PlayerCardView = {
  id: string;
  organizationId: string;
  seasonYear: number;
  readiness: PlayerReadiness;
  checks: PlayerCheckView[];
  completeCount: number;
  totalRequired: number;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  jerseyNumber: string | null;
  jerseySize: string | null;
  rosterStatus: string | null;
  birthDate: string | null;
  gender: string | null;
  allStarAgeBand: string | null;
  guardianFirstName: string | null;
  guardianLastName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  contactPhone: string | null;
  paymentStatus: string | null;
  birthCertificateStatus: string | null;
  registrationOrderNo: string | null;
  registrationOrderDate: string | null;
  /** Hidden for GUARDIAN audience. */
  streetAddress: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  /** Summary only for COACH; hidden for GUARDIAN. */
  medicalConditionsSummary: string | null;
  /** ADMIN only. */
  medicalConditionsDetails: string | null;
  medicalTreatmentAuthorized: boolean | null;
  liabilityWaiverAccepted: boolean | null;
  codeOfConductAccepted: boolean | null;
  refundPolicyAccepted: boolean | null;
  team: {
    id: string;
    teamName: string;
    ageGroup: string;
    seasonYear: number;
  };
  createdAt: string;
  updatedAt: string;
};

export const PLAYER_CHECK_LABELS: Record<PlayerCheckKey, string> = {
  GUARDIAN_CONTACT: "Guardian contact",
  PAYMENT: "Payment status",
  BIRTH_CERTIFICATE: "Birth certificate",
  LIABILITY_WAIVER: "Liability waiver",
  CODE_OF_CONDUCT: "Code of conduct",
  REFUND_POLICY: "Refund policy",
  MEDICAL_AUTH: "Medical authorization",
  ROSTER_STATUS: "Roster status",
};

export const READINESS_LABELS: Record<PlayerReadiness, string> = {
  READY: "Ready",
  INCOMPLETE: "Incomplete",
  BLOCKED: "Blocked",
};

/** Fields used to evaluate checklist / readiness (client-safe). */
export type PlayerCardFields = {
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  contactPhone?: string | null;
  paymentStatus?: string | null;
  birthCertificateStatus?: string | null;
  liabilityWaiverAccepted?: boolean | null;
  codeOfConductAccepted?: boolean | null;
  refundPolicyAccepted?: boolean | null;
  medicalTreatmentAuthorized?: boolean | null;
  rosterStatus?: string | null;
  teamId?: string | null;
};
