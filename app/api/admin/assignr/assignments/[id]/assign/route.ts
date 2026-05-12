import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import {
  assignOfficialToAssignment,
  formatAssignrApiError,
} from "@/lib/assignr/assignments";
import { revalidateAssignrGamesCache } from "@/lib/assignr/invalidation";
import { recordAssignrAuditLog } from "@/lib/assignr/jobs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as { officialId?: string | number };
  if (body.officialId === undefined || body.officialId === null || body.officialId === "") {
    return NextResponse.json({ error: "officialId is required" }, { status: 400 });
  }

  try {
    await assignOfficialToAssignment(id, body.officialId);
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "assignment.assign",
      assignrResource: "assignment",
      assignrResourceId: id,
      requestSummary: body,
      success: true,
      adminUserId: auth.adminUserId,
    });
    revalidateAssignrGamesCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = formatAssignrApiError(error);
    const friendlyMessage =
      /not found|invalid_route|not supported/i.test(message)
        ? "Assignr did not accept this umpire assignment through API. Assign the umpire in Assignr, then refresh."
        : message;
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "assignment.assign",
      assignrResource: "assignment",
      assignrResourceId: id,
      requestSummary: body,
      success: false,
      errorMessage: message,
      adminUserId: auth.adminUserId,
    });
    return NextResponse.json({ error: friendlyMessage }, { status: 502 });
  }
}
