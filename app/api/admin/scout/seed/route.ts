import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { requireScoutApi } from "@/lib/scout/requireScout";
import { scoutSyntheticSeedBlockReason } from "@/lib/scout/seedGuard";
import { seedSyntheticScoutTickets } from "@/lib/scout/syntheticSeed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireScoutApi(request);
  if (!auth.ok) return auth.response;

  const blocked = scoutSyntheticSeedBlockReason(process.env, "admin");
  if (blocked) {
    return NextResponse.json({ error: "Synthetic Scout tickets are not available in this environment." }, { status: 403 });
  }

  try {
    const result = await seedSyntheticScoutTickets(prisma);
    return NextResponse.json({ ok: true, upserted: result.upserted });
  } catch (err) {
    console.error("[scout] synthetic seed failed", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Could not load sample tickets." }, { status: 500 });
  }
}
