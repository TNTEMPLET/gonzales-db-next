import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { checkInScoreboardRemote } from "@/lib/admin/scoreboardRemotes/mutate";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const admin = await getAdminUserFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readJson(request);
  const checkoutId =
    body && typeof body === "object" && typeof (body as { checkoutId?: unknown }).checkoutId === "string"
      ? (body as { checkoutId: string }).checkoutId
      : "";
  const result = await checkInScoreboardRemote(admin, checkoutId);
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
