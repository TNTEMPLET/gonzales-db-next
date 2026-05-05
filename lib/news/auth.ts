import type { NextRequest } from "next/server";

import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  canAccessAdminModule,
  hasAdminRoleAtLeast,
  type AdminModule,
  type AdminRole,
} from "@/lib/auth/adminRoles";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";

export async function isNewsAdmin(request: NextRequest): Promise<boolean> {
  const adminUser = await getAdminUserFromRequest(request);
  return Boolean(adminUser);
}

export async function ensureNewsAdmin(request: NextRequest): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  return ensureAdminModule(request, "NEWS_ADMIN");
}

export async function ensureAdminModule(
  request: NextRequest,
  module: AdminModule,
): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return {
      ok: false,
      status: 401,
      message: "Unauthorized",
    };
  }

  const orgId = resolveAuthOrganizationId(request);
  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    orgId,
  );
  if (!effectiveRole) {
    return {
      ok: false,
      status: 403,
      message: "No admin access for this organization",
    };
  }

  if (!canAccessAdminModule(effectiveRole, module)) {
    return {
      ok: false,
      status: 403,
      message: "Forbidden",
    };
  }

  return { ok: true, status: 200 };
}

export async function ensureAdminRole(
  request: NextRequest,
  minimumRole: AdminRole,
): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return {
      ok: false,
      status: 401,
      message: "Unauthorized",
    };
  }

  const orgId = resolveAuthOrganizationId(request);
  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    orgId,
  );
  if (!effectiveRole) {
    return {
      ok: false,
      status: 403,
      message: "No admin access for this organization",
    };
  }

  if (!hasAdminRoleAtLeast(effectiveRole, minimumRole)) {
    return {
      ok: false,
      status: 403,
      message: "Forbidden",
    };
  }

  return { ok: true, status: 200 };
}
