import { NextRequest, NextResponse } from "next/server";

import { loadScoutPage } from "@/lib/scout/queries";
import { requireScoutApi } from "@/lib/scout/requireScout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireScoutApi(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const page = await loadScoutPage({
    status: searchParams.get("status"),
    orgTag: searchParams.get("orgTag"),
    sender: searchParams.get("sender"),
    ticketId: searchParams.get("ticket"),
  });

  if (page.storageMessage) {
    return NextResponse.json({ error: page.storageMessage }, { status: 503 });
  }

  return NextResponse.json({
    tickets: page.tickets,
    selected: page.selected,
    sync: page.sync,
    attentionCount: page.attentionCount,
  });
}
