import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { canMasterBypassApproval } from "@/lib/communications/policy";
import { ensureAdminModule } from "@/lib/news/auth";
import {
  createRoleDef,
  listRoleDefs,
} from "@/lib/volunteers/roles";

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

/** List role catalog. All VOLUNTEERS admins can read active; Master can include inactive. */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  try {
    const admin = await getAdminUserFromRequest(request);
    const includeInactive =
      request.nextUrl.searchParams.get("includeInactive") === "1" &&
      Boolean(admin?.isMaster || (admin && canMasterBypassApproval(admin.role as never)));

    const rows = await listRoleDefs(includeInactive);
    return NextResponse.json({
      data: rows.map((r) => ({
        id: r.id,
        key: r.key,
        label: r.label,
        description: r.description,
        isActive: r.isActive,
        sortOrder: r.sortOrder,
      })),
    });
  } catch (err: unknown) {
    console.error("[admin/volunteers/roles GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load roles" },
      { status: 500 },
    );
  }
}

/** Create role — Master Admin only. */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }
  const master = await requireMaster(request);
  if (!master.ok) return master.response;

  try {
    const body = (await request.json()) as {
      key?: string;
      label?: string;
      description?: string | null;
      isActive?: boolean;
      sortOrder?: number;
    };
    if (!body.label?.trim()) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }
    const created = await createRoleDef({
      key: body.key,
      label: body.label,
      description: body.description,
      isActive: body.isActive,
      sortOrder: body.sortOrder,
      createdByAdminId: master.admin.id,
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Create failed";
    const status = message.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
