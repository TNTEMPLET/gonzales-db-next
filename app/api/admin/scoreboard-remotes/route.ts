import { NextRequest, NextResponse } from "next/server";

import { remoteActorFromRequest } from "@/lib/admin/scoreboardRemotes/auth";
import { loadRemoteInventoryScreen } from "@/lib/admin/scoreboardRemotes/load";
import { createScoreboardController } from "@/lib/admin/scoreboardRemotes/mutate";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await remoteActorFromRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const screen = await loadRemoteInventoryScreen(auth.actor);
  return NextResponse.json({ screen });
}

export async function POST(request: NextRequest) {
  const auth = await remoteActorFromRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await readJson(request);
  const result = await createScoreboardController(auth.actor.admin, {
    orgId: auth.actor.orgId,
    venueId: stringField(body, "venueId"),
    label: field(body, "label"),
    homeFieldName: field(body, "homeFieldName"),
    notes: field(body, "notes"),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ screen: await loadRemoteInventoryScreen(auth.actor) }, { status: 201 });
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

function stringField(body: unknown, key: string): string {
  const value = field(body, key);
  return typeof value === "string" ? value : "";
}
