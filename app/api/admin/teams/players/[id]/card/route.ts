import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import { getPlayerCard } from "@/lib/players/service";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

/**
 * Admin Player Card for a single TeamPlayer (module: TEAMS).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const { id } = await context.params;
  const playerId = id?.trim();
  if (!playerId) {
    return NextResponse.json({ error: "Player id is required" }, { status: 400 });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));

  try {
    const card = await getPlayerCard(playerId, targetOrg, "ADMIN");
    if (!card) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    return NextResponse.json(
      { data: card },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load player card";
    console.error("[admin/teams/players/card GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
