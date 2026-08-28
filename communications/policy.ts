import type { AdminRole, CommunicationCampaignStatus } from "@prisma/client";

import { hasAdminRoleAtLeast } from "@/lib/auth/adminRoles";

export function canSendForOrg(actorRole: AdminRole | null, targetOrg: string | null, actorOrg: string) {
  if (!actorRole) return false;
  if (!hasAdminRoleAtLeast(actorRole, "ADMIN")) return false;
  if (!targetOrg) return actorRole === "MASTER_ADMIN";
  return actorRole === "MASTER_ADMIN" || targetOrg === actorOrg;
}

/** Master Admin may send without a second approver (draft / pending approval). */
export function canMasterBypassApproval(actorRole: AdminRole | null) {
  return actorRole === "MASTER_ADMIN";
}

/**
 * Who may call send-now for a given campaign status.
 * - APPROVED / SCHEDULED: any sender with org permission (caller enforces org).
 * - DRAFT / PENDING_APPROVAL: Master Admin only.
 */
export function canSendNowWithoutApproval(
  actorRole: AdminRole | null,
  status: CommunicationCampaignStatus,
) {
  if (status === "APPROVED" || status === "SCHEDULED") return true;
  if (status === "DRAFT" || status === "PENDING_APPROVAL") {
    return canMasterBypassApproval(actorRole);
  }
  return false;
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
