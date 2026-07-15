import { NextRequest, NextResponse } from "next/server";

import { parseBody } from "@/lib/api/parseBody";
import { authFailureResponse, jsonError } from "@/lib/api/respond";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { requireMasterFromAuth } from "@/lib/auth/requireMasterAdmin";
import { deleteRoleDef, updateRoleDef } from "@/lib/volunteers/roles";
import { volunteerRoleUpdateSchema } from "@/lib/volunteers/schemas";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) return authFailureResponse(auth);
  const master = requireMasterFromAuth(auth);
  if (!master.ok) return master.response;

  try {
    const { id } = await params;
    const rawBody: unknown = await request.json();
    const parsed = parseBody(volunteerRoleUpdateSchema, rawBody);
    if (!parsed.ok) {
      return jsonError(parsed.error, 400, { issues: parsed.issues });
    }
    const updated = await updateRoleDef(id, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Update failed";
    return jsonError(message, message.includes("not found") ? 404 : 400);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) return authFailureResponse(auth);
  const master = requireMasterFromAuth(auth);
  if (!master.ok) return master.response;

  try {
    const { id } = await params;
    const result = await deleteRoleDef(id);
    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return jsonError(message, message.includes("not found") ? 404 : 400);
  }
}
