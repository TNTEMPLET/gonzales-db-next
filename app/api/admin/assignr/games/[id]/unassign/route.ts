import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import { unassignAssignrGame } from "@/lib/assignr/assignments";
import { revalidateAssignrGamesCache } from "@/lib/assignr/invalidation";
import { recordAssignrAuditLog } from "@/lib/assignr/jobs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  try {
    await unassignAssignrGame(id);
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "game.unassign",
      assignrResource: "game",
      assignrResourceId: id,
      success: true,
      adminUserId: auth.adminUserId,
    });
    revalidateAssignrGamesCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "game.unassign",
      assignrResource: "game",
      assignrResourceId: id,
      success: false,
      errorMessage: message,
      adminUserId: auth.adminUserId,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
