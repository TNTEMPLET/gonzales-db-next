import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { AdminSessionUser } from "@/lib/auth/adminSession";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import type { EnsureAdminResult } from "@/lib/auth/ensureAdminModule";
import { isMasterAdminActor } from "@/lib/auth/ensureAdminModule";
import { canMasterBypassApproval } from "@/lib/communications/policy";
import type { AdminRole } from "@/lib/auth/adminRoles";

export type RequireMasterOk = {
  ok: true;
  admin: AdminSessionUser;
};

export type RequireMasterFail = {
  ok: false;
  response: NextResponse;
};

/**
 * Master Admin gate for catalog / platform settings (roles, from-addresses, etc.).
 * Accepts either a prior ensureAdminModule success result or a raw request.
 */
export function requireMasterFromAuth(
  auth: Extract<EnsureAdminResult, { ok: true }>,
): RequireMasterOk | RequireMasterFail {
  if (isMasterAdminActor(auth) || canMasterBypassApproval(auth.role)) {
    return { ok: true, admin: auth.admin };
  }
  return {
    ok: false,
    response: NextResponse.json({ error: "Master Admin required" }, { status: 403 }),
  };
}

export async function requireMasterAdmin(
  request: NextRequest,
): Promise<RequireMasterOk | RequireMasterFail> {
  const admin = await getAdminUserFromRequest(request);
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (admin.isMaster || canMasterBypassApproval(admin.role as AdminRole)) {
    return { ok: true, admin };
  }
  return {
    ok: false,
    response: NextResponse.json({ error: "Master Admin required" }, { status: 403 }),
  };
}
