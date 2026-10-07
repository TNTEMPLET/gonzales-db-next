import { NextRequest, NextResponse } from "next/server";

import { requireScoutApi } from "@/lib/scout/requireScout";
import { runScoutMailboxSync } from "@/lib/scout/runSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireScoutApi(request);
  if (!auth.ok) return auth.response;

  const result = await runScoutMailboxSync();
  return NextResponse.json(result);
}
