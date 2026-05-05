import type { NextRequest } from "next/server";

import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { isCommunicationsModuleEnabled } from "@/lib/communications/config";

export async function resolveCommunicationActor(request: NextRequest) {
  if (!isCommunicationsModuleEnabled()) {
    return {
      ok: false as const,
      status: 404,
      message: "Communications module is disabled",
    };
  }
  const auth = await ensureAdminModule(request, "COMMUNICATIONS");
  if (!auth.ok) {
    return {
      ok: false as const,
      status: auth.status,
      message: auth.message || "Unauthorized",
    };
  }
  const admin = await getAdminUserFromRequest(request);
  if (!admin) {
    return {
      ok: false as const,
      status: 401,
      message: "Unauthorized",
    };
  }
  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const role = await getEffectiveAdminRoleForOrg(admin.id, admin.isMaster, targetOrg);
  return {
    ok: true as const,
    admin,
    targetOrg,
    role,
  };
}
