import { type AdminRole } from "@/lib/auth/adminRoles";
import prisma from "@/lib/prisma";
import type { ContentOrgId } from "@/lib/siteConfig";

/**
 * Single source of truth for an admin's effective role on a specific organization.
 *
 * - Masters (isMaster flag) are MASTER_ADMIN everywhere.
 * - Everyone else must have an explicit row in AdminOrgMembership for that org.
 * - AdminUser.role is no longer consulted for authorization decisions.
 */
export async function getEffectiveAdminRoleForOrg(
  adminUserId: string,
  isMaster: boolean,
  organizationId: ContentOrgId,
): Promise<AdminRole | null> {
  if (isMaster) return "MASTER_ADMIN";

  const row = await prisma.adminOrgMembership.findUnique({
    where: {
      adminUserId_organizationId: { adminUserId, organizationId },
    },
    select: { role: true },
  });

  return row?.role ?? null;
}

/**
 * @deprecated For authorization decisions, use getEffectiveAdminRoleForOrg + isMaster.
 * This helper can be used only for cosmetic "highest role across orgs" display.
 * It no longer writes to AdminUser.role for auth purposes.
 */
export async function syncAdminUserAggregateRole(adminUserId: string) {
  // Intentionally a no-op for the new model.
  // The AdminUser.role column is treated as legacy/display only.
  return;
}
