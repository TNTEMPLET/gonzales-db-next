import type { NextRequest } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import prisma from "@/lib/prisma";

export async function ensureAllStarVaultAdmin(request: NextRequest) {
  return ensureAdminModule(request, "ALL_STAR_VAULT");
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
  if (!adminUser) return false;

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
