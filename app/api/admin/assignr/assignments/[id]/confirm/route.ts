import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import { confirmAssignrAssignment } from "@/lib/assignr/assignments";
import { revalidateAssignrGamesCache } from "@/lib/assignr/invalidation";
import { recordAssignrAuditLog } from "@/lib/assignr/jobs";
import type { AssignrAssignmentConfirmPayload } from "@/lib/assignr/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as AssignrAssignmentConfirmPayload;
  if (body.status !== "A" && body.status !== "D") {
    return NextResponse.json({ error: "status must be A or D" }, { status: 400 });
  }

  try {
    await confirmAssignrAssignment(id, body);
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "assignment.confirm",
      assignrResource: "assignment",
      assignrResourceId: id,
      requestSummary: body,
      success: true,
      adminUserId: auth.adminUserId,
    });
    revalidateAssignrGamesCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "assignment.confirm",
      assignrResource: "assignment",
      assignrResourceId: id,
      requestSummary: body,
      success: false,
      errorMessage: message,
      adminUserId: auth.adminUserId,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
