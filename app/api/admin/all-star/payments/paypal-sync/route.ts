import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { syncPayPalTransactionsForCycle } from "@/lib/paypal/client";

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as { cycleId?: string };
  if (!body.cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const result = await syncPayPalTransactionsForCycle(body.cycleId);
  return NextResponse.json({ success: true, ...result });
}
