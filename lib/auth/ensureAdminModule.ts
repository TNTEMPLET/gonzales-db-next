import type { NextRequest } from "next/server";

import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  canAccessAdminModule,
  hasAdminRoleAtLeast,
  type AdminModule,
  type AdminRole,
} from "@/lib/auth/adminRoles";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import {
  getAdminUserFromRequest,
  type AdminSessionUser,
} from "@/lib/auth/adminSession";

export type EnsureAdminResult =
  | {
      ok: true;
      status: 200;
      admin: AdminSessionUser;
      role: AdminRole;
      orgId: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

/**
 * Gate an admin API route on session + effective org role + module ACL.
 * Prefer importing from `@/lib/auth/ensureAdminModule` (canonical).
 * `@/lib/news/auth` re-exports for backward compatibility.
 */
export async function ensureAdminModule(
  request: NextRequest,
  module: AdminModule,
): Promise<EnsureAdminResult> {
  try {
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

    return {
      ok: true,
      status: 200,
      admin: adminUser,
      role: effectiveRole,
      orgId,
    };
  } catch (err) {
    console.error("[ensureAdminModule] auth check failed:", err);
    return {
      ok: false,
      status: 401,
      message: "Unauthorized",
    };
  }
}

export async function ensureAdminRole(
  request: NextRequest,
  minimumRole: AdminRole,
): Promise<EnsureAdminResult> {
  try {
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

    return {
      ok: true,
      status: 200,
      admin: adminUser,
      role: effectiveRole,
      orgId,
    };
  } catch (err) {
    console.error("[ensureAdminRole] auth check failed:", err);
    return {
      ok: false,
      status: 401,
      message: "Unauthorized",
    };
  }
}

/** True when the successful auth result is a Master Admin (deployment or role). */
export function isMasterAdminActor(
  auth: Extract<EnsureAdminResult, { ok: true }>,
): boolean {
  return auth.admin.isMaster || auth.role === "MASTER_ADMIN";
}
