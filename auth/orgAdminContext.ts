import type { NextRequest } from "next/server";

import {
  getDefaultContentOrg,
  isMasterDeployment,
  resolveAdminTargetOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

/**
 * Organization used for admin authorization on this request (module access, user management, etc.).
 */
export function resolveAuthOrganizationId(request: NextRequest): ContentOrgId {
  const fromQuery = request.nextUrl.searchParams.get("org");
  if (isMasterDeployment()) {
    return resolveAdminTargetOrg(fromQuery);
  }
  return getDefaultContentOrg();
}
