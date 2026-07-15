import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { canMasterBypassApproval } from "@/lib/communications/policy";
import { ensureAdminModule } from "@/lib/news/auth";
import { deleteRoleDef, updateRoleDef } from "@/lib/volunteers/roles";

async function requireMaster(request: NextRequest) {
  const admin = await getAdminUserFromRequest(request);
  if (!admin) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (admin.isMaster || canMasterBypassApproval(admin.role as never)) {
    return { ok: true as const, admin };
  }
  return {
    ok: false as const,
    response: NextResponse.json({ error: "Master Admin required" }, { status: 403 }),
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }
  const master = await requireMaster(request);
  if (!master.ok) return master.response;

  try {
    const { id } = await params;
    const body = (await request.json()) as {
      label?: string;
      description?: string | null;
      isActive?: boolean;
      sortOrder?: number;
    };
    const updated = await updateRoleDef(id, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Update failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }
  const master = await requireMaster(request);
  if (!master.ok) return master.response;

  try {
    const { id } = await params;
    const result = await deleteRoleDef(id);
    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
