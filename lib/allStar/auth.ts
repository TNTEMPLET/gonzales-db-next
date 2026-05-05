import type { NextRequest } from "next/server";

import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import prisma from "@/lib/prisma";

/**
 * Changing ballots, cycles, invites, etc. Allowed for org admins with the All-Star module
 * or for registered users granted Full Access on the vault.
 */
export async function ensureAllStarVaultAdmin(request: NextRequest) {
  return ensureAllStarVaultAccess(request, { needsManage: true });
}

/**
 * Reading cycles, candidates, submissions, vote summaries, etc. Also allowed for
 * registered users with View Only or Full Access on the vault (same admin session email + org).
 */
export async function ensureAllStarVaultAccess(
  request: NextRequest,
  options: { needsManage: boolean },
): Promise<{ ok: boolean; status: number; message?: string }> {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  const orgId = resolveAuthOrganizationId(request);
  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    orgId,
  );

  if (effectiveRole && canAccessAdminModule(effectiveRole, "ALL_STAR_VAULT")) {
    return { ok: true, status: 200 };
  }

  const registeredUsers = await prisma.registeredUser.findMany({
    where: {
      email: { equals: adminUser.email, mode: "insensitive" },
      organizationId: orgId,
    },
    select: { id: true },
  });

  for (const row of registeredUsers) {
    if (options.needsManage) {
      if (await canManageAllStarVault(row.id, orgId)) {
        return { ok: true, status: 200 };
      }
    } else if (await canViewAllStarVault(row.id, orgId)) {
      return { ok: true, status: 200 };
    }
  }

  return { ok: false, status: 403, message: "Forbidden" };
}

async function hasImplicitAllStarFullAccess(registeredUserId: string) {
  const registeredUser = await prisma.registeredUser.findUnique({
    where: { id: registeredUserId },
    select: { email: true },
  });
  if (!registeredUser?.email) return false;

  const adminUser = await prisma.adminUser.findFirst({
    where: { email: { equals: registeredUser.email, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
    select: { role: true, isMaster: true },
  });
  if (!adminUser || !adminUser.isMaster) return false;

  const adminRole = toAdminRole(adminUser.role, adminUser.isMaster);
  return hasAdminRoleAtLeast(adminRole, "ADMIN");
}

export async function getAllStarVaultRoleForUser(
  registeredUserId: string,
  organizationId: "gonzales" | "ascension",
) {
  const access = await prisma.allStarVaultAccess.findUnique({
    where: {
      registeredUserId_organizationId: { registeredUserId, organizationId },
    },
    select: { role: true },
  });
  if (access?.role) return access.role;

  if (await hasImplicitAllStarFullAccess(registeredUserId)) {
    return "FULL_ACCESS";
  }
  return null;
}

export async function canViewAllStarVault(
  registeredUserId: string,
  organizationId: "gonzales" | "ascension",
) {
  const role = await getAllStarVaultRoleForUser(registeredUserId, organizationId);
  return role === "FULL_ACCESS" || role === "VIEW_ONLY";
}

export async function canManageAllStarVault(
  registeredUserId: string,
  organizationId: "gonzales" | "ascension",
) {
  const role = await getAllStarVaultRoleForUser(registeredUserId, organizationId);
  return role === "FULL_ACCESS";
}
