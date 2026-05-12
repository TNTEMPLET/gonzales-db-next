import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import { getAssignrGame, updateAssignrGame } from "@/lib/assignr/games";
import { revalidateAssignrGamesCache } from "@/lib/assignr/invalidation";
import { recordAssignrAuditLog } from "@/lib/assignr/jobs";
import type { AssignrGameUpdatePayload } from "@/lib/assignr/types";

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
    const game = await getAssignrGame(id);
    return NextResponse.json({ data: game });
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
  const body = (await request.json()) as AssignrGameUpdatePayload;

  try {
    const current = await getAssignrGame(id);
    const payload: AssignrGameUpdatePayload = {
      ...body,
      lock_version: body.lock_version ?? current.lock_version,
    };
    const updated = await updateAssignrGame(id, payload);
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "game.update",
      assignrResource: "game",
      assignrResourceId: id,
      requestSummary: payload,
      responseSummary: { id: updated.id, status: updated.status },
      success: true,
      adminUserId: auth.adminUserId,
    });
    revalidateAssignrGamesCache();
    return NextResponse.json({ data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "game.update",
      assignrResource: "game",
      assignrResourceId: id,
      requestSummary: body,
      success: false,
      errorMessage: message,
      adminUserId: auth.adminUserId,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
