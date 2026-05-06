import {
  getHighestAdminRole,
  type AdminRole,
  toAdminRole,
} from "@/lib/auth/adminRoles";
import prisma from "@/lib/prisma";
import type { ContentOrgId } from "@/lib/siteConfig";

export async function getEffectiveAdminRoleForOrg(
  adminUserId: string,
  isMaster: boolean,
  organizationId: ContentOrgId,
): Promise<AdminRole | null> {
  if (isMaster) return "MASTER_ADMIN";

  const adminUser = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    select: { role: true },
  });
  if (!adminUser) return null;

  // Command-and-control roles are global across orgs.
  const aggregateRole = toAdminRole(adminUser.role, false);
  if (aggregateRole === "BOARD_MEMBER" || aggregateRole === "PARK_DIRECTOR") {
    return aggregateRole;
  }

  const row = await prisma.adminOrgMembership.findUnique({
    where: {
      adminUserId_organizationId: { adminUserId, organizationId },
    },
  });
  if (!row) return null;
  return toAdminRole(row.role, false);
}

export async function syncAdminUserAggregateRole(adminUserId: string) {
  const user = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    select: { isMaster: true },
  });
  if (!user || user.isMaster) return;

  const memberships = await prisma.adminOrgMembership.findMany({
    where: { adminUserId },
    select: { role: true },
  });
  const roles = memberships.map((m) => m.role);
  const aggregate = getHighestAdminRole(roles);
  await prisma.adminUser.update({
    where: { id: adminUserId },
    data: { role: aggregate },
  });
}
