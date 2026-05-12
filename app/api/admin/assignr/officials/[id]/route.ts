import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import { getAssignrUser, officialDisplayName, updateAssignrUser } from "@/lib/assignr/officials";
import { recordAssignrAuditLog } from "@/lib/assignr/jobs";
import type { AssignrUserUpdatePayload } from "@/lib/assignr/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  try {
    const user = await getAssignrUser(id);
    return NextResponse.json({
      data: { ...user, displayName: officialDisplayName(user) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as AssignrUserUpdatePayload;

  try {
    const updated = await updateAssignrUser(id, body);
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "official.update",
      assignrResource: "user",
      assignrResourceId: id,
      requestSummary: body,
      responseSummary: { id: updated.id },
      success: true,
      adminUserId: auth.adminUserId,
    });
    return NextResponse.json({
      data: { ...updated, displayName: officialDisplayName(updated) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "official.update",
      assignrResource: "user",
      assignrResourceId: id,
      requestSummary: body,
      success: false,
      errorMessage: message,
      adminUserId: auth.adminUserId,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
