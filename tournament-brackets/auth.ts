import type { NextRequest } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import { isMasterDeployment } from "@/lib/siteConfig";

/** v1: Master deployment + Master Admin (isMaster) + TOURNAMENT_BRACKETS module. */
export async function ensureTournamentBracketsMaster(request: NextRequest): Promise<
  | { ok: true; adminUserId: string }
  | { ok: false; status: number; message: string }
> {
  if (!isMasterDeployment()) {
    return { ok: false, status: 403, message: "Tournament Brackets are only available on the master admin site." };
  }

  const mod = await ensureAdminModule(request, "TOURNAMENT_BRACKETS");
  if (!mod.ok) {
    return { ok: false, status: mod.status, message: mod.message || "Forbidden" };
  }

  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser?.isMaster) {
    return { ok: false, status: 403, message: "Master Admin access required." };
  }

  return { ok: true, adminUserId: adminUser.id };
}
