import { NextRequest, NextResponse } from "next/server";

import { loadScoutAttentionCount } from "@/lib/scout/queries";
import { requireScoutApi } from "@/lib/scout/requireScout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireScoutApi(request);
  if (!auth.ok) return auth.response;

  try {
    const attentionCount = await loadScoutAttentionCount();
    return NextResponse.json({ attentionCount });
  } catch (err) {
    console.error("[scout] summary failed", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ attentionCount: 0 });
  }
}
