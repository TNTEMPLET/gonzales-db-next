import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { isContentOrgId } from "@/lib/siteConfig";
import { listFinalizedRosterCyclesForOrg } from "@/lib/trip/importFromRoster";

function resolveOrg(request: NextRequest): string {
  const q =
    request.nextUrl.searchParams.get("organizationId")?.trim() ||
    request.nextUrl.searchParams.get("org")?.trim();
  if (q && isContentOrgId(q)) return q;
  return resolveAuthOrganizationId(request);
}

/** List All-Star ballot cycles with a finalized roster for trip import. */
export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const organizationId = resolveOrg(request);
  const cycles = await listFinalizedRosterCyclesForOrg(organizationId);
  return NextResponse.json({ organizationId, cycles });
}
