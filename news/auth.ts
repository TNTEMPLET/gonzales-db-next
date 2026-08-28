import type { NextRequest } from "next/server";

/**
 * News-specific admin helpers.
 * General admin module gating lives in `@/lib/auth/ensureAdminModule`.
 * Re-exports kept so existing `import { ensureAdminModule } from "@/lib/news/auth"` keeps working.
 */
export {
  ensureAdminModule,
  ensureAdminRole,
  isMasterAdminActor,
  type EnsureAdminResult,
} from "@/lib/auth/ensureAdminModule";

import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";

export async function isNewsAdmin(request: NextRequest): Promise<boolean> {
  const adminUser = await getAdminUserFromRequest(request);
  return Boolean(adminUser);
}

export async function ensureNewsAdmin(request: NextRequest) {
  return ensureAdminModule(request, "NEWS_ADMIN");
}
