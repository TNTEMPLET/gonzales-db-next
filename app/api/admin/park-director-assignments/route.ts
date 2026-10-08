import { NextRequest, NextResponse } from "next/server";

import { requireParkDirectorAssigner } from "@/lib/admin/parkDirector/apiAuth";
import {
  assignParkDirectorVenue,
  loadParkDirectorAssignmentScreen,
  unassignParkDirectorVenue,
} from "@/lib/admin/parkDirector/assignments";

export const dynamic = "force-dynamic";

async function readBody(request: NextRequest): Promise<{ adminUserId?: string; venueId?: string }> {
  try {
    const body = (await request.json()) as { adminUserId?: unknown; venueId?: unknown };
    return {
      adminUserId: typeof body.adminUserId === "string" ? body.adminUserId : "",
      venueId: typeof body.venueId === "string" ? body.venueId : "",
    };
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireParkDirectorAssigner(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const screen = await loadParkDirectorAssignmentScreen();
  return NextResponse.json({ screen });
}

export async function POST(request: NextRequest) {
  const auth = await requireParkDirectorAssigner(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await readBody(request);
  const result = await assignParkDirectorVenue({
    actorAdminId: auth.adminId,
    adminUserId: body.adminUserId || "",
    venueId: body.venueId || "",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ screen: await loadParkDirectorAssignmentScreen() });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireParkDirectorAssigner(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await readBody(request);
  const result = await unassignParkDirectorVenue({
    adminUserId: body.adminUserId || "",
    venueId: body.venueId || "",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ screen: await loadParkDirectorAssignmentScreen() });
}
