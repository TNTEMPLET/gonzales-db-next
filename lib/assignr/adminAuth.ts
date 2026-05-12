import type { NextRequest } from "next/server";

import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import type { ContentOrgId } from "@/lib/siteConfig";

export async function ensureAssignrAdmin(request: NextRequest) {
  const auth = await ensureAdminModule(request, "ASSIGNR");
  if (!auth.ok) {
    return {
      ok: false as const,
      status: auth.status,
      message: auth.message || "Unauthorized",
    };
  }

  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return { ok: false as const, status: 401, message: "Unauthorized" };
  }

  const organizationId = resolveAuthOrganizationId(request);
  return {
    ok: true as const,
    organizationId,
    adminUserId: adminUser.id,
  };
}

export function requireAssignrOrgParam(
  organizationId: ContentOrgId,
  bodyOrg?: string | null,
) {
  if (bodyOrg && bodyOrg !== organizationId) {
    return `Organization mismatch: expected ${organizationId}`;
  }
  return null;
}
