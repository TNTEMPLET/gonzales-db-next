import type { AdminRole } from "@prisma/client";

import { hasAdminRoleAtLeast } from "@/lib/auth/adminRoles";

export function canSendForOrg(actorRole: AdminRole | null, targetOrg: string | null, actorOrg: string) {
  if (!actorRole) return false;
  if (!hasAdminRoleAtLeast(actorRole, "ADMIN")) return false;
  if (!targetOrg) return actorRole === "MASTER_ADMIN";
  return actorRole === "MASTER_ADMIN" || targetOrg === actorOrg;
}

export function canApproveCampaign(params: {
  approverRole: AdminRole | null;
  approverAdminId: string;
  campaignCreatedByAdminId: string | null;
}) {
  const { approverRole, approverAdminId, campaignCreatedByAdminId } = params;
  if (!approverRole || !hasAdminRoleAtLeast(approverRole, "BOARD_MEMBER")) return false;
  if (campaignCreatedByAdminId && campaignCreatedByAdminId === approverAdminId) return false;
  return true;
}

export function isWithinQuietHours(now: Date, quietHoursStart: number | null, quietHoursEnd: number | null) {
  if (quietHoursStart == null || quietHoursEnd == null) return false;
  const h = now.getHours();
  if (quietHoursStart === quietHoursEnd) return true;
  if (quietHoursStart < quietHoursEnd) {
    return h >= quietHoursStart && h < quietHoursEnd;
  }
  return h >= quietHoursStart || h < quietHoursEnd;
}
