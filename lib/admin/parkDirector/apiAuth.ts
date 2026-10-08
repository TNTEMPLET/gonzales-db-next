import type { NextRequest } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { isMasterDeployment } from "@/lib/siteConfig";

export type ParkDirectorAssigner =
  | { ok: true; adminId: string }
  | { ok: false; status: number; message: string };

/**
 * Assigning a director to a physical park is a master-site action.
 * Venues are shared by every league, and Role Assignment is a Master Admin job.
 * A league site (Gonzales, Ascension, Fall Ball) returns 404 so it does not
 * grow a second editor. The same Master Admin check as /admin/roles applies:
 * the isMaster flag, or an effective MASTER_ADMIN role.
 */
export async function requireParkDirectorAssigner(
  request: NextRequest,
): Promise<ParkDirectorAssigner> {
  if (!isMasterDeployment()) {
    return { ok: false, status: 404, message: "Not found" };
  }
  const admin = await getAdminUserFromRequest(request);
  if (!admin) return { ok: false, status: 401, message: "Unauthorized" };
  if (admin.isMaster) return { ok: true, adminId: admin.id };

  const role = await getEffectiveAdminRoleForOrg(
    admin.id,
    false,
    resolveAuthOrganizationId(request),
  );
  if (role !== "MASTER_ADMIN") {
    return { ok: false, status: 403, message: "Forbidden" };
  }
  return { ok: true, adminId: admin.id };
}
