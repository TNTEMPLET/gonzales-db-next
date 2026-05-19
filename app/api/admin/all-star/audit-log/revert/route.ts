import { NextRequest, NextResponse } from "next/server";

import {
  ensureMasterAllStarAuditAccess,
  revertAllStarAuditLog,
} from "@/lib/allStar/auditLog";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export async function POST(request: NextRequest) {
  const auth = await ensureMasterAllStarAuditAccess(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as { logId?: string; org?: string };
  const logId = body.logId?.trim();
  if (!logId) {
    return NextResponse.json({ error: "logId is required" }, { status: 400 });
  }

  const organizationId = body.org
    ? resolveAdminTargetOrg(body.org)
    : resolveAuthOrganizationId(request);

  try {
    await revertAllStarAuditLog({
      logId,
      organizationId,
      adminUserId: auth.adminUser.id,
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to revert change";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
