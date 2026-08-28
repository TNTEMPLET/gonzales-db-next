/**
 * Client-safe volunteer types (no Prisma runtime imports).
 * Role catalog is Master Admin–managed in DB; FALLBACK_ROLES is UI bootstrap only.
 */

/** Seed / offline fallback when API has not loaded role catalog yet. */
export const FALLBACK_VOLUNTEER_ROLES = [
  {
    key: "LEAGUE_HEAD_COACH",
    label: "League Head Coach",
    isActive: true,
    sortOrder: 0,
  },
  {
    key: "LEAGUE_ASSISTANT_COACH",
    label: "League Assistant Coach",
    isActive: true,
    sortOrder: 10,
  },
  {
    key: "HEAD_COACH",
    label: "Head Coach",
    isActive: true,
    sortOrder: 20,
  },
  {
    key: "AP_BASEBALL_UMPIRE",
    label: "AP Baseball Umpire",
    isActive: true,
    sortOrder: 30,
  },
  {
    key: "OTHER_AP_POSITIONS",
    label: "Other AP Positions  (NOT COACHES)",
    isActive: true,
    sortOrder: 40,
  },
] as const;

/** @deprecated use role catalog from API; kept for compile-time convenience */
export const VOLUNTEER_ROLES = FALLBACK_VOLUNTEER_ROLES.map((r) => r.key);

export type VolunteerRole = string;

export type VolunteerRoleDefView = {
  id?: string;
  key: string;
  label: string;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
};

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
  /** Opaque badge mark; no public meaning. */
  aMark: boolean;
  readiness: VolunteerReadiness;
  roles: Array<{
    id: string;
    roleKey: string;
    label: string;
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

/** Fallback labels when catalog not loaded. */
export const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  FALLBACK_VOLUNTEER_ROLES.map((r) => [r.key, r.label]),
);

export function labelForRoleKey(
  key: string,
  catalog?: VolunteerRoleDefView[] | null,
): string {
  const fromCatalog = catalog?.find((r) => r.key === key)?.label;
  if (fromCatalog) return fromCatalog;
  return ROLE_LABELS[key] || key.replaceAll("_", " ");
}

export const READINESS_LABELS: Record<VolunteerReadiness, string> = {
  READY: "Ready",
  INCOMPLETE: "Incomplete",
  EXPIRED: "Expired",
  BLOCKED: "Blocked",
};

/** Validate machine key for new roles. */
export function validateRoleKey(
  value: string,
): { ok: true; key: string } | { ok: false; error: string } {
  const key = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!key) return { ok: false, error: "Role key is required" };
  if (key.length > 64) return { ok: false, error: "Role key is too long" };
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    return {
      ok: false,
      error: "Use uppercase letters, numbers, and underscores (e.g. LEAGUE_HEAD_COACH)",
    };
  }
  return { ok: true, key };
}
