/**
 * Client-safe volunteer types (no Prisma runtime imports).
 */

export const VOLUNTEER_ROLES = [
  "HEAD_COACH",
  "ASSISTANT_COACH",
  "TEAM_PARENT",
  "BOARD",
  "OTHER",
] as const;

export type VolunteerRole = (typeof VOLUNTEER_ROLES)[number];

export const VOLUNTEER_REQUIREMENT_KEYS = ["JDP", "ABUSE_AWARENESS"] as const;

export type VolunteerRequirementKey = (typeof VOLUNTEER_REQUIREMENT_KEYS)[number];

export const VOLUNTEER_REQUIREMENT_STATUSES = [
  "NOT_STARTED",
  "PENDING",
  "CLEAR",
  "EXPIRED",
  "FAILED",
  "WAIVED",
] as const;

export type VolunteerRequirementStatusValue =
  (typeof VOLUNTEER_REQUIREMENT_STATUSES)[number];

export type VolunteerProfileStatus = "ACTIVE" | "INACTIVE";

export type VolunteerReadiness = "READY" | "INCOMPLETE" | "EXPIRED" | "BLOCKED";

export type VolunteerRequirementView = {
  key: VolunteerRequirementKey;
  label: string;
  status: VolunteerRequirementStatusValue;
  required: boolean;
  allowsVolunteerUpload: boolean;
  completedAt: string | null;
  expiresAt: string | null;
  externalRef: string | null;
  documentUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  uploadedAt: string | null;
  notes: string | null;
  reviewedAt: string | null;
};

export type VolunteerCardView = {
  id: string;
  organizationId: string;
  seasonYear: number;
  status: VolunteerProfileStatus;
  notes: string | null;
  readiness: VolunteerReadiness;
  roles: Array<{
    id: string;
    role: VolunteerRole;
    teamId: string | null;
  }>;
  requirements: VolunteerRequirementView[];
  registeredUser: {
    id: string;
    email: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    contactPhone: string | null;
    isCoach: boolean;
    ageGroup: string | null;
    assignedTeam: string | null;
  };
  teamAssignments: Array<{
    id: string;
    role: string;
    team: {
      id: string;
      teamName: string;
      ageGroup: string;
      seasonYear: number;
    };
  }>;
  createdAt: string;
  updatedAt: string;
};

export const REQUIREMENT_LABELS: Record<VolunteerRequirementKey, string> = {
  JDP: "JDP Background Check",
  ABUSE_AWARENESS: "Abuse Awareness Training",
};

export const ROLE_LABELS: Record<VolunteerRole, string> = {
  HEAD_COACH: "Head Coach",
  ASSISTANT_COACH: "Assistant Coach",
  TEAM_PARENT: "Team Parent",
  BOARD: "Board",
  OTHER: "Other",
};

export const READINESS_LABELS: Record<VolunteerReadiness, string> = {
  READY: "Ready",
  INCOMPLETE: "Incomplete",
  EXPIRED: "Expired",
  BLOCKED: "Blocked",
};
