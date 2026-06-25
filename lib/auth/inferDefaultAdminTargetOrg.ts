import { canViewAllStarVault } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";
import { CONTENT_ORGS, type ContentOrgId } from "@/lib/siteConfig";

/**
 * On the master admin deployment, pick a sensible default content org when the URL has no `?org=`.
 * - Master Admins: no default (caller should show “All Sites”).
 * - Everyone else: prefer the org where they are Site Admin (ADMIN membership); then a single
 *   membership; then a single org with All-Star vault access; otherwise null (stay on All Sites).
 */
export async function inferDefaultAdminTargetOrgForMasterDashboard(
  adminUserId: string,
  adminEmail: string,
  isMaster: boolean,
): Promise<ContentOrgId | null> {
  if (isMaster) return null;

  const memberships = await prisma.adminOrgMembership.findMany({
    where: { adminUserId },
    select: { organizationId: true, role: true },
  });
  const contentMemberships = memberships.flatMap((m) => {
    if (!CONTENT_ORGS.includes(m.organizationId as ContentOrgId)) {
      return [];
    }
    return [{ organizationId: m.organizationId as ContentOrgId, role: m.role }];
  });

  if (contentMemberships.length === 1) {
    return contentMemberships[0].organizationId;
  }

  if (contentMemberships.length > 1) {
    const adminSites = contentMemberships.filter((m) => m.role === "ADMIN");
    if (adminSites.length === 1) {
      return adminSites[0].organizationId;
    }
    if (adminSites.length > 1) {
      const sorted = [...adminSites].sort((a, b) =>
        a.organizationId.localeCompare(b.organizationId),
      );
      return sorted[0].organizationId;
    }
  }

  const registered = await prisma.registeredUser.findMany({
    where: {
      email: { equals: adminEmail, mode: "insensitive" },
      organizationId: { in: [...CONTENT_ORGS] },
    },
    select: { id: true, organizationId: true },
  });

  const vaultOrgs: ContentOrgId[] = [];
  for (const row of registered) {
    if (!CONTENT_ORGS.includes(row.organizationId as ContentOrgId)) continue;
    const orgId = row.organizationId as ContentOrgId;
    if (await canViewAllStarVault(row.id, orgId)) {
      vaultOrgs.push(orgId);
    }
  }
  const uniqueVault = [...new Set(vaultOrgs)];
  if (uniqueVault.length === 1) {
    return uniqueVault[0];
  }

  return null;
}
