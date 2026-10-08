import type { NextRequest } from "next/server";

import { ensureAdminModule, type EnsureAdminResult } from "@/lib/auth/ensureAdminModule";
import { isMasterDeployment } from "@/lib/siteConfig";

/** Master deployment first, then the VENUES module (Master Admin). */
export async function requireVenuesAdmin(request: NextRequest): Promise<EnsureAdminResult> {
  if (!isMasterDeployment()) {
    return { ok: false, status: 404, message: "Not found" };
  }
  return ensureAdminModule(request, "VENUES");
}
