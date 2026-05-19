import type { NextRequest } from "next/server";

import { areAllBallotsSubmittedForCycle } from "@/lib/allStar/ballotRosterComplete";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import prisma from "@/lib/prisma";

/**
 * Changing ballots, cycles, invites, etc. Allowed for Master Admins or registered
 * users granted Full Access on the vault.
 */
export async function ensureAllStarVaultAdmin(request: NextRequest) {
  return ensureAllStarVaultAccess(request, { needsManage: true });
}

/**
 * Reading cycles, candidates, submissions, vote summaries, etc. Also allowed for
 * registered users with Limited Admin or Full Access on the vault (same admin session email + org).
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
  if (adminUser.isMaster) {
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
  return role === "FULL_ACCESS" || role === "LIMITED_ADMIN";
}

export async function canManageAllStarVault(
  registeredUserId: string,
  organizationId: "gonzales" | "ascension",
) {
  const role = await getAllStarVaultRoleForUser(registeredUserId, organizationId);
  return role === "FULL_ACCESS";
}

export async function canEditFinalRosterForUser(
  registeredUserId: string,
  organizationId: "gonzales" | "ascension",
  cycleId: string,
) {
  const role = await getAllStarVaultRoleForUser(registeredUserId, organizationId);
  if (role === "FULL_ACCESS") return true;
  if (role === "LIMITED_ADMIN") return areAllBallotsSubmittedForCycle(cycleId);
  return false;
}

/**
 * Final roster overrides: Full Access always; Limited Admin only after all coaches submit.
 */
export async function ensureAllStarVaultFinalRosterAdmin(
  request: NextRequest,
  cycleId: string,
): Promise<{ ok: boolean; status: number; message?: string }> {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  const orgId = resolveAuthOrganizationId(request);
  if (adminUser.isMaster) {
    return { ok: true, status: 200 };
  }

  const registeredUsers = await prisma.registeredUser.findMany({
    where: {
      email: { equals: adminUser.email, mode: "insensitive" },
      organizationId: orgId,
    },
    select: { id: true },
  });

  let hasLimitedAdminOnly = false;
  for (const row of registeredUsers) {
    if (await canEditFinalRosterForUser(row.id, orgId, cycleId)) {
      return { ok: true, status: 200 };
    }
    const role = await getAllStarVaultRoleForUser(row.id, orgId);
    if (role === "LIMITED_ADMIN") hasLimitedAdminOnly = true;
  }

  if (hasLimitedAdminOnly) {
    return {
      ok: false,
      status: 403,
      message: "Final roster edits unlock after all coaches have submitted",
    };
  }

  return { ok: false, status: 403, message: "Forbidden" };
}

export async function resolveAllStarVaultAccessForAdmin(options: {
  isMaster: boolean;
  email: string;
  organizationId: "gonzales" | "ascension";
}) {
  if (options.isMaster) {
    return {
      vaultView: true,
      vaultManage: true,
      canManageAllStarVaultUi: true,
      isLimitedVaultAccess: false,
    };
  }

  const vaultLinkedUsers = await prisma.registeredUser.findMany({
    where: {
      email: { equals: options.email, mode: "insensitive" },
      organizationId: options.organizationId,
    },
    select: { id: true },
  });

  let vaultView = false;
  let vaultManage = false;
  for (const row of vaultLinkedUsers) {
    if (await canViewAllStarVault(row.id, options.organizationId)) vaultView = true;
    if (await canManageAllStarVault(row.id, options.organizationId)) vaultManage = true;
  }

  const canManageAllStarVaultUi = vaultManage;
  const isLimitedVaultAccess = vaultView && !canManageAllStarVaultUi;

  return {
    vaultView,
    vaultManage,
    canManageAllStarVaultUi,
    isLimitedVaultAccess,
  };
}

/**
 * Delete a submitted ballot: Master Admins or vault Full Access only.
 * Limited vault access (LIMITED_ADMIN) is read-only for submissions.
 */
export async function ensureAllStarVaultCanDeleteVoteSubmission(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return { ok: false as const, status: 401, message: "Unauthorized" };
  }

  const orgId = resolveAuthOrganizationId(request);
  if (adminUser.isMaster) {
    return { ok: true as const, status: 200 };
  }

  const registeredUsers = await prisma.registeredUser.findMany({
    where: {
      email: { equals: adminUser.email, mode: "insensitive" },
      organizationId: orgId,
    },
    select: { id: true },
  });

  for (const row of registeredUsers) {
    if (await canManageAllStarVault(row.id, orgId)) {
      return { ok: true as const, status: 200 };
    }
  }

  return { ok: false as const, status: 403, message: "Forbidden" };
}
