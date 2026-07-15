import { NextRequest, NextResponse } from "next/server";

import { parseBody } from "@/lib/api/parseBody";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { requireMasterFromAuth } from "@/lib/auth/requireMasterAdmin";
import { createRoleDef, listRoleDefs } from "@/lib/volunteers/roles";
import { volunteerRoleCreateSchema } from "@/lib/volunteers/schemas";

/** List role catalog. All VOLUNTEERS admins can read active; Master can include inactive. */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  try {
    const master = requireMasterFromAuth(auth);
    const includeInactive =
      request.nextUrl.searchParams.get("includeInactive") === "1" && master.ok;

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
  const master = requireMasterFromAuth(auth);
  if (!master.ok) return master.response;

  try {
    const rawBody: unknown = await request.json();
    const parsed = parseBody(volunteerRoleCreateSchema, rawBody);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error, issues: parsed.issues },
        { status: 400 },
      );
    }

    const created = await createRoleDef({
      key: parsed.data.key,
      label: parsed.data.label,
      description: parsed.data.description,
      isActive: parsed.data.isActive,
      sortOrder: parsed.data.sortOrder,
      createdByAdminId: master.admin.id,
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Create failed";
    const status = message.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
