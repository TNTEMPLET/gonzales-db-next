import { NextRequest, NextResponse } from "next/server";

import {
  ensureMasterAllStarAuditAccess,
  listAllStarAuditLogs,
} from "@/lib/allStar/auditLog";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";

export async function GET(request: NextRequest) {
  const auth = await ensureMasterAllStarAuditAccess(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const organizationId = resolveAuthOrganizationId(request);
  const cycleId = request.nextUrl.searchParams.get("cycleId")?.trim() || null;
  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("pageSize") || "25", 10)),
  );

  const result = await listAllStarAuditLogs({
    organizationId,
    ballotCycleId: cycleId,
    page,
    pageSize,
  });

  return NextResponse.json(result);
}
