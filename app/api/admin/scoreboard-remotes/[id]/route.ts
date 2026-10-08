import { NextRequest, NextResponse } from "next/server";

import { remoteActorFromRequest } from "@/lib/admin/scoreboardRemotes/auth";
import { loadRemoteInventoryScreen } from "@/lib/admin/scoreboardRemotes/load";
import { updateScoreboardController } from "@/lib/admin/scoreboardRemotes/mutate";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await remoteActorFromRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const body = await readJson(request);
  const result = await updateScoreboardController(auth.actor.admin, {
    orgId: auth.actor.orgId,
    controllerId: id,
    label: field(body, "label"),
    homeFieldName: field(body, "homeFieldName"),
    notes: field(body, "notes"),
    status: field(body, "status"),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ screen: await loadRemoteInventoryScreen(auth.actor) });
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function field(body: unknown, key: string): unknown {
  if (!body || typeof body !== "object") return undefined;
  return (body as Record<string, unknown>)[key];
}
