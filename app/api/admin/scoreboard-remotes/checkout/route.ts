import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { checkoutScoreboardRemote } from "@/lib/admin/scoreboardRemotes/mutate";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const admin = await getAdminUserFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readJson(request);
  const result = await checkoutScoreboardRemote(admin, {
    gameId: stringField(body, "gameId"),
    controllerId: stringField(body, "controllerId"),
    side: stringField(body, "side"),
    volunteerName: stringField(body, "volunteerName"),
    notes: stringField(body, "notes") || null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function stringField(body: unknown, key: string): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}
