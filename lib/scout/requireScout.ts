import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest, type AdminSessionUser } from "@/lib/auth/adminSession";
import { scoutApiAccess } from "@/lib/scout/access";
import { isMasterDeployment } from "@/lib/siteConfig";

export async function requireScoutApi(
  request: NextRequest,
): Promise<{ ok: true; admin: AdminSessionUser } | { ok: false; response: NextResponse }> {
  const masterDeployment = isMasterDeployment();
  const admin = masterDeployment ? await getAdminUserFromRequest(request) : null;
  const decision = scoutApiAccess({
    masterDeployment,
    email: admin?.email ?? null,
  });
  if (!decision.ok) {
    const message =
      decision.status === 401 ? "Unauthorized" : decision.status === 403 ? "Forbidden" : "Not found";
    return {
      ok: false,
      response: NextResponse.json({ error: message }, { status: decision.status }),
    };
  }
  return { ok: true, admin: admin! };
}
