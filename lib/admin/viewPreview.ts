import type { ContentOrgId } from "@/lib/siteConfig";

export type PreviewUserEffectiveRole =
  | "MASTER_ADMIN"
  | "ADMIN"
  | "BOARD_MEMBER"
  | "PARK_DIRECTOR";

export type PreviewUserMembershipSnapshot = {
  organizationId: ContentOrgId;
  effectiveRole: PreviewUserEffectiveRole;
  allStarVaultView: boolean;
};

export type PreviewUserSnapshot = {
  id: string;
  label: string;
  memberships: PreviewUserMembershipSnapshot[];
};

const roleRank: Record<PreviewUserEffectiveRole, number> = {
  MASTER_ADMIN: 5,
  ADMIN: 4,
  BOARD_MEMBER: 3,
  PARK_DIRECTOR: 2,
};

function highestEffectiveRole(
  roles: PreviewUserEffectiveRole[],
): PreviewUserEffectiveRole {
  if (roles.length === 0) return "PARK_DIRECTOR";
  return roles.reduce((best, role) =>
    roleRank[role] > roleRank[best] ? role : best,
  );
}

export function resolvePreviewUserAccess(
  user: PreviewUserSnapshot,
  organizationId?: ContentOrgId | null,
): { effectiveRole: PreviewUserEffectiveRole; allStarVaultView: boolean } {
  const memberships = user.memberships ?? [];
  if (organizationId) {
    const row = memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
    if (row) {
      return {
        effectiveRole: row.effectiveRole,
        allStarVaultView: row.allStarVaultView,
      };
    }
  }

  if (memberships.length === 0) {
    return { effectiveRole: "PARK_DIRECTOR", allStarVaultView: false };
  }

  return {
    effectiveRole: highestEffectiveRole(
      memberships.map((membership) => membership.effectiveRole),
    ),
    allStarVaultView: memberships.some((membership) => membership.allStarVaultView),
  };
}

export function formatPreviewUserLabel(input: {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string;
}) {
  const displayName =
    [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
    input.name?.trim() ||
    input.email;
  return `${displayName} (${input.email})`;
}
