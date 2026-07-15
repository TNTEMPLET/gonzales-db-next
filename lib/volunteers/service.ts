import type { Prisma, TeamCoachRole } from "@prisma/client";

import prisma from "@/lib/prisma";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import type { ContentOrgId } from "@/lib/siteConfig";

import { computeVolunteerReadiness } from "./readiness";
import { ensureDefaultRoleDefs } from "./roles";
import {
  REQUIREMENT_LABELS,
  ROLE_LABELS,
  type VolunteerCardView,
  type VolunteerRequirementKey,
  type VolunteerRequirementStatusValue,
  type VolunteerRole,
  VOLUNTEER_REQUIREMENT_KEYS,
} from "./types";

const DEFAULT_DEFS: Array<{
  key: VolunteerRequirementKey;
  label: string;
  description: string;
  requiredByDefault: boolean;
  allowsVolunteerUpload: boolean;
  expiresAfterDays: number | null;
  sortOrder: number;
}> = [
  {
    key: "JDP",
    label: "JDP Background Check",
    description:
      "Background check clearance via JDP (or league-approved equivalent). Admin marks status.",
    requiredByDefault: true,
    allowsVolunteerUpload: false,
    expiresAfterDays: 365,
    sortOrder: 0,
  },
  {
    key: "ABUSE_AWARENESS",
    label: "Abuse Awareness Training",
    description: "Abuse awareness certificate upload.",
    requiredByDefault: true,
    allowsVolunteerUpload: true,
    expiresAfterDays: null,
    sortOrder: 10,
  },
];

function teamCoachRoleToVolunteerRole(role: TeamCoachRole): VolunteerRole {
  return role === "HEAD_COACH" ? "LEAGUE_HEAD_COACH" : "LEAGUE_ASSISTANT_COACH";
}

export async function ensureRequirementDefs() {
  for (const def of DEFAULT_DEFS) {
    await prisma.volunteerRequirementDef.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        label: def.label,
        description: def.description,
        requiredByDefault: def.requiredByDefault,
        allowsVolunteerUpload: def.allowsVolunteerUpload,
        expiresAfterDays: def.expiresAfterDays,
        sortOrder: def.sortOrder,
      },
      update: {
        label: def.label,
        description: def.description,
        requiredByDefault: def.requiredByDefault,
        allowsVolunteerUpload: def.allowsVolunteerUpload,
        expiresAfterDays: def.expiresAfterDays,
        sortOrder: def.sortOrder,
      },
    });
  }
}

async function ensureRequirementRows(volunteerProfileId: string) {
  await prisma.volunteerRequirementStatus.createMany({
    data: VOLUNTEER_REQUIREMENT_KEYS.map((key) => ({
      volunteerProfileId,
      requirementKey: key,
      status: "NOT_STARTED" as const,
    })),
    skipDuplicates: true,
  });
}

/** Copy legacy RegisteredUser AAT columns onto the volunteer status row (dual-read). */
async function hydrateAatFromLegacyUser(
  volunteerProfileId: string,
  user: {
    abuseAwarenessTrainingCertificateUrl: string | null;
    abuseAwarenessTrainingCertificateFileName: string | null;
    abuseAwarenessTrainingCertificateMimeType: string | null;
    abuseAwarenessTrainingCertificateUploadedAt: Date | null;
  },
) {
  if (!user.abuseAwarenessTrainingCertificateUrl) return;

  const existing = await prisma.volunteerRequirementStatus.findUnique({
    where: {
      volunteerProfileId_requirementKey: {
        volunteerProfileId,
        requirementKey: "ABUSE_AWARENESS",
      },
    },
  });

  if (
    existing &&
    (existing.status === "CLEAR" ||
      existing.status === "WAIVED" ||
      existing.documentUrl)
  ) {
    return;
  }

  await prisma.volunteerRequirementStatus.upsert({
    where: {
      volunteerProfileId_requirementKey: {
        volunteerProfileId,
        requirementKey: "ABUSE_AWARENESS",
      },
    },
    create: {
      volunteerProfileId,
      requirementKey: "ABUSE_AWARENESS",
      status: "CLEAR",
      documentUrl: user.abuseAwarenessTrainingCertificateUrl,
      fileName: user.abuseAwarenessTrainingCertificateFileName,
      mimeType: user.abuseAwarenessTrainingCertificateMimeType,
      uploadedAt: user.abuseAwarenessTrainingCertificateUploadedAt,
      completedAt: user.abuseAwarenessTrainingCertificateUploadedAt ?? new Date(),
    },
    update: {
      status: "CLEAR",
      documentUrl: user.abuseAwarenessTrainingCertificateUrl,
      fileName: user.abuseAwarenessTrainingCertificateFileName,
      mimeType: user.abuseAwarenessTrainingCertificateMimeType,
      uploadedAt: user.abuseAwarenessTrainingCertificateUploadedAt,
      completedAt:
        existing?.completedAt ??
        user.abuseAwarenessTrainingCertificateUploadedAt ??
        new Date(),
    },
  });
}

export async function ensureVolunteerProfile(input: {
  organizationId: string;
  registeredUserId: string;
  seasonYear?: number;
  roles?: Array<{ role: VolunteerRole; teamId?: string | null }>;
}) {
  const seasonYear =
    input.seasonYear ??
    getSeasonConfigForOrg(input.organizationId as ContentOrgId).year;

  const user = await prisma.registeredUser.findFirst({
    where: {
      id: input.registeredUserId,
      organizationId: input.organizationId,
    },
  });
  if (!user) {
    throw new Error("Registered user not found for organization");
  }

  const profile = await prisma.volunteerProfile.upsert({
    where: {
      organizationId_registeredUserId_seasonYear: {
        organizationId: input.organizationId,
        registeredUserId: input.registeredUserId,
        seasonYear,
      },
    },
    create: {
      organizationId: input.organizationId,
      registeredUserId: input.registeredUserId,
      seasonYear,
      status: "ACTIVE",
    },
    update: {
      status: "ACTIVE",
    },
  });

  await ensureRequirementRows(profile.id);
  await hydrateAatFromLegacyUser(profile.id, user);

  if (input.roles?.length) {
    await ensureDefaultRoleDefs();
    for (const r of input.roles) {
      const teamId = r.teamId ?? null;
      const roleKey = r.role;
      const existingRole = await prisma.volunteerRoleAssignment.findFirst({
        where: {
          volunteerProfileId: profile.id,
          roleKey,
          teamId,
        },
      });
      if (!existingRole) {
        await prisma.volunteerRoleAssignment.create({
          data: {
            volunteerProfileId: profile.id,
            roleKey,
            teamId,
          },
        });
      }
    }
  }

  return profile;
}

/**
 * Ensure volunteer profiles for all coaches in an org/season.
 * Sources: isCoach flag + team coach assignments for the season.
 * Uses bulk createMany where possible to stay under Prisma Postgres connection limits.
 */
export async function syncCoachesToVolunteers(
  organizationId: string,
  seasonYear?: number,
): Promise<{ createdOrUpdated: number }> {
  await ensureRequirementDefs();
  const year =
    seasonYear ?? getSeasonConfigForOrg(organizationId as ContentOrgId).year;

  const coaches = await prisma.registeredUser.findMany({
    where: {
      organizationId,
      OR: [
        { isCoach: true },
        {
          teamCoachAssignments: {
            some: {
              team: {
                organizationId,
                seasonYear: year,
              },
            },
          },
        },
      ],
    },
    include: {
      teamCoachAssignments: {
        where: {
          team: {
            organizationId,
            seasonYear: year,
          },
        },
      },
    },
  });

  if (coaches.length === 0) return { createdOrUpdated: 0 };

  await prisma.volunteerProfile.createMany({
    data: coaches.map((c) => ({
      organizationId,
      registeredUserId: c.id,
      seasonYear: year,
      status: "ACTIVE" as const,
    })),
    skipDuplicates: true,
  });

  // Reactivate any that existed as INACTIVE
  await prisma.volunteerProfile.updateMany({
    where: {
      organizationId,
      seasonYear: year,
      registeredUserId: { in: coaches.map((c) => c.id) },
      status: "INACTIVE",
    },
    data: { status: "ACTIVE" },
  });

  const profiles = await prisma.volunteerProfile.findMany({
    where: {
      organizationId,
      seasonYear: year,
      registeredUserId: { in: coaches.map((c) => c.id) },
    },
    select: { id: true, registeredUserId: true },
  });
  const profileByUser = new Map(profiles.map((p) => [p.registeredUserId, p.id]));

  const reqRows: Array<{
    volunteerProfileId: string;
    requirementKey: VolunteerRequirementKey;
    status: "NOT_STARTED";
  }> = [];
  for (const p of profiles) {
    for (const key of VOLUNTEER_REQUIREMENT_KEYS) {
      reqRows.push({
        volunteerProfileId: p.id,
        requirementKey: key,
        status: "NOT_STARTED",
      });
    }
  }
  if (reqRows.length) {
    await prisma.volunteerRequirementStatus.createMany({
      data: reqRows,
      skipDuplicates: true,
    });
  }

  // Roles from team assignments + default assistant for bare isCoach
  await ensureDefaultRoleDefs();
  const roleRows: Array<{
    volunteerProfileId: string;
    roleKey: string;
    teamId: string | null;
  }> = [];
  for (const coach of coaches) {
    const profileId = profileByUser.get(coach.id);
    if (!profileId) continue;
    if (coach.teamCoachAssignments.length === 0 && coach.isCoach) {
      roleRows.push({
        volunteerProfileId: profileId,
        roleKey: "LEAGUE_ASSISTANT_COACH",
        teamId: null,
      });
    }
    for (const a of coach.teamCoachAssignments) {
      roleRows.push({
        volunteerProfileId: profileId,
        roleKey: teamCoachRoleToVolunteerRole(a.role),
        teamId: a.teamId,
      });
    }
  }

  const profileIds = profiles.map((p) => p.id);
  const existingRoles = profileIds.length
    ? await prisma.volunteerRoleAssignment.findMany({
        where: { volunteerProfileId: { in: profileIds } },
        select: { volunteerProfileId: true, roleKey: true, teamId: true },
      })
    : [];
  const roleRowKey = (r: {
    volunteerProfileId: string;
    roleKey: string;
    teamId: string | null;
  }) => `${r.volunteerProfileId}|${r.roleKey}|${r.teamId ?? ""}`;
  const existingRoleKeys = new Set(existingRoles.map(roleRowKey));
  const newRoles = roleRows.filter((r) => !existingRoleKeys.has(roleRowKey(r)));
  if (newRoles.length) {
    await prisma.volunteerRoleAssignment.createMany({
      data: newRoles,
      skipDuplicates: true,
    });
  }

  // Hydrate AAT from legacy columns — only when status row has no document yet
  const withAat = coaches.filter((c) => c.abuseAwarenessTrainingCertificateUrl);
  if (withAat.length) {
    const aatStatuses = await prisma.volunteerRequirementStatus.findMany({
      where: {
        volunteerProfileId: { in: profileIds },
        requirementKey: "ABUSE_AWARENESS",
      },
      select: {
        volunteerProfileId: true,
        status: true,
        documentUrl: true,
      },
    });
    const aatByProfile = new Map(aatStatuses.map((s) => [s.volunteerProfileId, s]));
    const aatUpdates = withAat
      .map((coach) => {
        const profileId = profileByUser.get(coach.id);
        if (!profileId) return null;
        const existing = aatByProfile.get(profileId);
        if (
          existing &&
          (existing.status === "CLEAR" ||
            existing.status === "WAIVED" ||
            existing.documentUrl)
        ) {
          return null;
        }
        return {
          volunteerProfileId: profileId,
          documentUrl: coach.abuseAwarenessTrainingCertificateUrl!,
          fileName: coach.abuseAwarenessTrainingCertificateFileName,
          mimeType: coach.abuseAwarenessTrainingCertificateMimeType,
          uploadedAt: coach.abuseAwarenessTrainingCertificateUploadedAt,
        };
      })
      .filter(Boolean) as Array<{
      volunteerProfileId: string;
      documentUrl: string;
      fileName: string | null;
      mimeType: string | null;
      uploadedAt: Date | null;
    }>;

    // Sequential updates only for rows that need hydration (usually few after first sync)
    for (const row of aatUpdates) {
      await prisma.volunteerRequirementStatus.update({
        where: {
          volunteerProfileId_requirementKey: {
            volunteerProfileId: row.volunteerProfileId,
            requirementKey: "ABUSE_AWARENESS",
          },
        },
        data: {
          status: "CLEAR",
          documentUrl: row.documentUrl,
          fileName: row.fileName,
          mimeType: row.mimeType,
          uploadedAt: row.uploadedAt,
          completedAt: row.uploadedAt ?? new Date(),
        },
      });
    }
  }

  return { createdOrUpdated: coaches.length };
}

const profileInclude = {
  registeredUser: true,
  roles: { include: { roleDef: true } },
  requirements: true,
} satisfies Prisma.VolunteerProfileInclude;

type ProfileWithRelations = Prisma.VolunteerProfileGetPayload<{
  include: typeof profileInclude;
}>;

type TeamAssignmentRow = {
  id: string;
  role: string;
  registeredUserId: string;
  team: {
    id: string;
    teamName: string;
    ageGroup: string;
    seasonYear: number;
  };
};

export async function loadTeamAssignmentsForUsers(
  organizationId: string,
  registeredUserIds: string[],
  seasonYear: number,
): Promise<Map<string, TeamAssignmentRow[]>> {
  const map = new Map<string, TeamAssignmentRow[]>();
  if (registeredUserIds.length === 0) return map;
  const rows = await prisma.teamCoachAssignment.findMany({
    where: {
      registeredUserId: { in: registeredUserIds },
      team: { organizationId, seasonYear },
    },
    include: {
      team: {
        select: {
          id: true,
          teamName: true,
          ageGroup: true,
          seasonYear: true,
        },
      },
    },
  });
  for (const row of rows) {
    const list = map.get(row.registeredUserId) || [];
    list.push({
      id: row.id,
      role: row.role,
      registeredUserId: row.registeredUserId,
      team: row.team,
    });
    map.set(row.registeredUserId, list);
  }
  return map;
}

export function toVolunteerCardView(
  profile: ProfileWithRelations,
  teamAssignments: Array<{
    id: string;
    role: string;
    team: {
      id: string;
      teamName: string;
      ageGroup: string;
      seasonYear: number;
    };
  }> = [],
  defs: Array<{
    key: VolunteerRequirementKey;
    label: string;
    requiredByDefault: boolean;
    allowsVolunteerUpload: boolean;
  }> = DEFAULT_DEFS,
): VolunteerCardView {
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const reqViews = VOLUNTEER_REQUIREMENT_KEYS.map((key) => {
    const def = defByKey.get(key);
    const row = profile.requirements.find((r) => r.requirementKey === key);
    return {
      key,
      label: def?.label || REQUIREMENT_LABELS[key],
      status: (row?.status ?? "NOT_STARTED") as VolunteerRequirementStatusValue,
      required: def?.requiredByDefault ?? true,
      allowsVolunteerUpload: def?.allowsVolunteerUpload ?? key === "ABUSE_AWARENESS",
      completedAt: row?.completedAt?.toISOString() ?? null,
      expiresAt: row?.expiresAt?.toISOString() ?? null,
      externalRef: row?.externalRef ?? null,
      documentUrl: row?.documentUrl ?? null,
      fileName: row?.fileName ?? null,
      mimeType: row?.mimeType ?? null,
      uploadedAt: row?.uploadedAt?.toISOString() ?? null,
      notes: row?.notes ?? null,
      reviewedAt: row?.reviewedAt?.toISOString() ?? null,
    };
  });

  const readiness = computeVolunteerReadiness(
    reqViews.map((r) => ({
      requirementKey: r.key,
      status: r.status,
      required: r.required,
    })),
  );

  return {
    id: profile.id,
    organizationId: profile.organizationId,
    seasonYear: profile.seasonYear,
    status: profile.status,
    notes: profile.notes,
    readiness,
    roles: profile.roles.map((r) => ({
      id: r.id,
      roleKey: r.roleKey,
      label: r.roleDef?.label || ROLE_LABELS[r.roleKey] || r.roleKey,
      teamId: r.teamId,
    })),
    requirements: reqViews,
    registeredUser: {
      id: profile.registeredUser.id,
      email: profile.registeredUser.email,
      name: profile.registeredUser.name,
      firstName: profile.registeredUser.firstName,
      lastName: profile.registeredUser.lastName,
      contactPhone: profile.registeredUser.contactPhone,
      isCoach: profile.registeredUser.isCoach,
      ageGroup: profile.registeredUser.ageGroup,
      assignedTeam: profile.registeredUser.assignedTeam,
    },
    teamAssignments,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export async function listVolunteerCards(input: {
  organizationId: string;
  seasonYear?: number;
  status?: "ACTIVE" | "INACTIVE";
  readiness?: string | null;
  missing?: VolunteerRequirementKey | null;
  role?: VolunteerRole | null;
  search?: string | null;
  autoSync?: boolean;
}): Promise<VolunteerCardView[]> {
  await ensureRequirementDefs();
  const year =
    input.seasonYear ??
    getSeasonConfigForOrg(input.organizationId as ContentOrgId).year;

  // Opt-in sync on list (button / first load with autoSync=1). Default false after bulk seed.
  if (input.autoSync === true) {
    await syncCoachesToVolunteers(input.organizationId, year);
  }

  const profiles = await prisma.volunteerProfile.findMany({
    where: {
      organizationId: input.organizationId,
      seasonYear: year,
      status: input.status ?? "ACTIVE",
      ...(input.role
        ? { roles: { some: { roleKey: input.role } } }
        : {}),
      ...(input.search
        ? {
            registeredUser: {
              OR: [
                { email: { contains: input.search, mode: "insensitive" } },
                { name: { contains: input.search, mode: "insensitive" } },
                { firstName: { contains: input.search, mode: "insensitive" } },
                { lastName: { contains: input.search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    include: profileInclude,
    orderBy: [{ updatedAt: "desc" }],
  });

  const defs = await prisma.volunteerRequirementDef.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const teamMap = await loadTeamAssignmentsForUsers(
    input.organizationId,
    profiles.map((p) => p.registeredUserId),
    year,
  );

  let cards = profiles.map((p) =>
    toVolunteerCardView(
      p,
      (teamMap.get(p.registeredUserId) || []).map((a) => ({
        id: a.id,
        role: a.role,
        team: a.team,
      })),
      defs,
    ),
  );

  if (input.readiness) {
    const r = input.readiness.toUpperCase();
    cards = cards.filter((c) => c.readiness === r);
  }
  if (input.missing) {
    const key = input.missing;
    cards = cards.filter((c) => {
      const req = c.requirements.find((x) => x.key === key);
      if (!req) return true;
      return (
        req.status === "NOT_STARTED" ||
        req.status === "PENDING" ||
        req.status === "EXPIRED" ||
        req.status === "FAILED"
      );
    });
  }

  return cards;
}

export async function getVolunteerCard(
  id: string,
  organizationId: string,
): Promise<VolunteerCardView | null> {
  await ensureRequirementDefs();
  const profile = await prisma.volunteerProfile.findFirst({
    where: { id, organizationId },
    include: profileInclude,
  });
  if (!profile) return null;

  await ensureRequirementRows(profile.id);
  await hydrateAatFromLegacyUser(profile.id, profile.registeredUser);

  const refreshed = await prisma.volunteerProfile.findFirst({
    where: { id, organizationId },
    include: profileInclude,
  });
  if (!refreshed) return null;

  const defs = await prisma.volunteerRequirementDef.findMany({
    orderBy: { sortOrder: "asc" },
  });
  const teamMap = await loadTeamAssignmentsForUsers(
    organizationId,
    [refreshed.registeredUserId],
    refreshed.seasonYear,
  );
  return toVolunteerCardView(
    refreshed,
    (teamMap.get(refreshed.registeredUserId) || []).map((a) => ({
      id: a.id,
      role: a.role,
      team: a.team,
    })),
    defs,
  );
}

export async function updateRequirementStatus(input: {
  volunteerProfileId: string;
  organizationId: string;
  requirementKey: VolunteerRequirementKey;
  status?: VolunteerRequirementStatusValue;
  completedAt?: Date | null;
  expiresAt?: Date | null;
  externalRef?: string | null;
  notes?: string | null;
  documentUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  uploadedAt?: Date | null;
  reviewedByAdminId?: string | null;
}) {
  const profile = await prisma.volunteerProfile.findFirst({
    where: {
      id: input.volunteerProfileId,
      organizationId: input.organizationId,
    },
    include: { registeredUser: true },
  });
  if (!profile) throw new Error("Volunteer profile not found");

  await ensureRequirementRows(profile.id);

  const data: Prisma.VolunteerRequirementStatusUpdateInput = {};
  if (input.status !== undefined) data.status = input.status;
  if (input.completedAt !== undefined) data.completedAt = input.completedAt;
  if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt;
  if (input.externalRef !== undefined) data.externalRef = input.externalRef;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.documentUrl !== undefined) data.documentUrl = input.documentUrl;
  if (input.fileName !== undefined) data.fileName = input.fileName;
  if (input.mimeType !== undefined) data.mimeType = input.mimeType;
  if (input.uploadedAt !== undefined) data.uploadedAt = input.uploadedAt;
  if (input.reviewedByAdminId) {
    data.reviewedByAdmin = { connect: { id: input.reviewedByAdminId } };
    data.reviewedAt = new Date();
  }

  if (
    input.status === "CLEAR" &&
    input.completedAt === undefined
  ) {
    data.completedAt = new Date();
  }

  const updated = await prisma.volunteerRequirementStatus.update({
    where: {
      volunteerProfileId_requirementKey: {
        volunteerProfileId: profile.id,
        requirementKey: input.requirementKey,
      },
    },
    data,
  });

  // Source of truth is VolunteerRequirementStatus. Do not dual-write RegisteredUser
  // legacy AAT columns (see hydrateAatFromLegacyUser for dual-read during migration).

  return updated;
}

/** AAT fields shaped like legacy RegisteredUser columns for Coach Corner UI. */
export type AatCertificateSnapshot = {
  abuseAwarenessTrainingCertificateUrl: string | null;
  abuseAwarenessTrainingCertificateFileName: string | null;
  abuseAwarenessTrainingCertificateMimeType: string | null;
  abuseAwarenessTrainingCertificateUploadedAt: Date | null;
};

export const EMPTY_AAT_SNAPSHOT: AatCertificateSnapshot = {
  abuseAwarenessTrainingCertificateUrl: null,
  abuseAwarenessTrainingCertificateFileName: null,
  abuseAwarenessTrainingCertificateMimeType: null,
  abuseAwarenessTrainingCertificateUploadedAt: null,
};

/**
 * Load Abuse Awareness certificate snapshots from Volunteer Cards (canonical).
 * Falls back to legacy RegisteredUser columns when the volunteer row has no document yet.
 */
export async function getAatSnapshotsByUserIds(input: {
  organizationId: string;
  registeredUserIds: string[];
  seasonYear?: number;
}): Promise<Map<string, AatCertificateSnapshot>> {
  const result = new Map<string, AatCertificateSnapshot>();
  const ids = [...new Set(input.registeredUserIds.filter(Boolean))];
  if (ids.length === 0) return result;

  const year =
    input.seasonYear ??
    getSeasonConfigForOrg(input.organizationId as ContentOrgId).year;

  const profiles = await prisma.volunteerProfile.findMany({
    where: {
      organizationId: input.organizationId,
      seasonYear: year,
      registeredUserId: { in: ids },
    },
    select: {
      registeredUserId: true,
      requirements: {
        where: { requirementKey: "ABUSE_AWARENESS" },
        select: {
          documentUrl: true,
          fileName: true,
          mimeType: true,
          uploadedAt: true,
          completedAt: true,
          status: true,
        },
      },
    },
  });

  for (const profile of profiles) {
    const req = profile.requirements[0];
    if (req?.documentUrl) {
      result.set(profile.registeredUserId, {
        abuseAwarenessTrainingCertificateUrl: req.documentUrl,
        abuseAwarenessTrainingCertificateFileName: req.fileName,
        abuseAwarenessTrainingCertificateMimeType: req.mimeType,
        abuseAwarenessTrainingCertificateUploadedAt:
          req.uploadedAt ?? req.completedAt,
      });
    }
  }

  const missing = ids.filter((id) => !result.has(id));
  if (missing.length) {
    const users = await prisma.registeredUser.findMany({
      where: {
        organizationId: input.organizationId,
        id: { in: missing },
      },
      select: {
        id: true,
        abuseAwarenessTrainingCertificateUrl: true,
        abuseAwarenessTrainingCertificateFileName: true,
        abuseAwarenessTrainingCertificateMimeType: true,
        abuseAwarenessTrainingCertificateUploadedAt: true,
      },
    });
    for (const user of users) {
      if (!user.abuseAwarenessTrainingCertificateUrl) continue;
      result.set(user.id, {
        abuseAwarenessTrainingCertificateUrl:
          user.abuseAwarenessTrainingCertificateUrl,
        abuseAwarenessTrainingCertificateFileName:
          user.abuseAwarenessTrainingCertificateFileName,
        abuseAwarenessTrainingCertificateMimeType:
          user.abuseAwarenessTrainingCertificateMimeType,
        abuseAwarenessTrainingCertificateUploadedAt:
          user.abuseAwarenessTrainingCertificateUploadedAt,
      });
    }
  }

  return result;
}

/** Record coach/admin AAT certificate upload onto the volunteer card (canonical write). */
export async function recordAbuseAwarenessUpload(input: {
  organizationId: string;
  registeredUserId: string;
  documentUrl: string;
  fileName: string | null;
  mimeType: string | null;
  uploadedAt?: Date;
  reviewedByAdminId?: string | null;
}) {
  const now = input.uploadedAt ?? new Date();
  const profile = await ensureVolunteerProfile({
    organizationId: input.organizationId,
    registeredUserId: input.registeredUserId,
  });
  await updateRequirementStatus({
    volunteerProfileId: profile.id,
    organizationId: input.organizationId,
    requirementKey: "ABUSE_AWARENESS",
    status: "CLEAR",
    documentUrl: input.documentUrl,
    fileName: input.fileName,
    mimeType: input.mimeType,
    uploadedAt: now,
    completedAt: now,
    reviewedByAdminId: input.reviewedByAdminId ?? null,
  });
  return {
    profileId: profile.id,
    snapshot: {
      abuseAwarenessTrainingCertificateUrl: input.documentUrl,
      abuseAwarenessTrainingCertificateFileName: input.fileName,
      abuseAwarenessTrainingCertificateMimeType: input.mimeType,
      abuseAwarenessTrainingCertificateUploadedAt: now,
    } satisfies AatCertificateSnapshot,
  };
}

export function volunteerCardsToCsv(cards: VolunteerCardView[]): string {
  const headers = [
    "Readiness",
    "First Name",
    "Last Name",
    "Name",
    "Email",
    "Phone",
    "Roles",
    "Teams",
    "JDP Status",
    "JDP Completed",
    "JDP Expires",
    "JDP Ref",
    "Abuse Awareness Status",
    "Abuse Awareness Uploaded",
    "Abuse Awareness File",
    "Season Year",
    "Profile Status",
    "Notes",
  ];

  const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;

  const lines = cards.map((c) => {
    const jdp = c.requirements.find((r) => r.key === "JDP");
    const aat = c.requirements.find((r) => r.key === "ABUSE_AWARENESS");
    const roles = c.roles.map((r) => r.label || r.roleKey).join("; ");
    const teams = c.teamAssignments
      .map((t) => `${t.team.ageGroup} ${t.team.teamName} (${t.role})`)
      .join("; ");
    return [
      c.readiness,
      c.registeredUser.firstName,
      c.registeredUser.lastName,
      c.registeredUser.name,
      c.registeredUser.email,
      c.registeredUser.contactPhone,
      roles,
      teams,
      jdp?.status,
      jdp?.completedAt,
      jdp?.expiresAt,
      jdp?.externalRef,
      aat?.status,
      aat?.uploadedAt,
      aat?.fileName || aat?.documentUrl,
      c.seasonYear,
      c.status,
      c.notes,
    ]
      .map(cell)
      .join(",");
  });

  return [headers.map(cell).join(","), ...lines].join("\n");
}
