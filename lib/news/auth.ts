import type { NextRequest } from "next/server";

import {
  hasAdminRoleAtLeast,
  toAdminRole,
  type AdminRole,
} from "@/lib/auth/adminRoles";
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
  if (!(await isNewsAdmin(request))) {
    return {
      ok: false,
      status: 401,
      message: "Unauthorized",
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

  const role = toAdminRole(adminUser.role, adminUser.isMaster);
  if (!hasAdminRoleAtLeast(role, minimumRole)) {
    return {
      ok: false,
      status: 403,
      message: "Forbidden",
    };
  }

  return { ok: true, status: 200 };
}
