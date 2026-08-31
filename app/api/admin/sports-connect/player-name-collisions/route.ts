import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import {
  createMissingTeamPlayerFromEnrollment,
  dismissPlayerNameCollision,
  getPlayerNameCollisionReport,
  mergeTeamPlayers,
} from "@/lib/sportsConnect/playerNameCollisions";
import { isContentOrgId, resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";
import type { PlayerNameCollisionFindingType } from "@/lib/sportsConnect/types";

export const dynamic = "force-dynamic";

function resolveSeasonYear(request: NextRequest, targetOrg: ContentOrgId): number {
  const seasonParam = request.nextUrl.searchParams.get("seasonYear");
  const parsed = seasonParam ? Number(seasonParam) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : getSeasonConfigForOrg(targetOrg).year;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(targetOrg)) {
    return NextResponse.json(
      { error: "Select a concrete site (not All Sites) to view player name collisions." },
      { status: 400 },
    );
  }
  const seasonYear = resolveSeasonYear(request, targetOrg);

  try {
    const report = await getPlayerNameCollisionReport({ organizationId: targetOrg, seasonYear });
    return NextResponse.json({ data: report }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load player name collisions";
    console.error("[player-name-collisions GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(targetOrg)) {
    return NextResponse.json(
      { error: "Select a concrete site (not All Sites) to manage player name collisions." },
      { status: 400 },
    );
  }
  const admin = await getAdminUserFromRequest(request);
  const adminId = admin?.id || null;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;

    if (action === "dismiss") {
      const ageGroup = String(body.ageGroup || "");
      const normalizedName = String(body.normalizedName || "");
      const findingType = body.findingType as PlayerNameCollisionFindingType;
      if (!ageGroup || !normalizedName || !findingType) {
        return NextResponse.json({ error: "ageGroup, normalizedName, and findingType are required" }, { status: 400 });
      }
      const seasonYear = resolveSeasonYear(request, targetOrg);
      await dismissPlayerNameCollision({ organizationId: targetOrg, seasonYear, ageGroup, normalizedName, findingType, adminId });
      return NextResponse.json({ success: true });
    }

    if (action === "merge") {
      const survivorTeamPlayerId = String(body.survivorTeamPlayerId || "");
      const loserTeamPlayerId = String(body.loserTeamPlayerId || "");
      if (!survivorTeamPlayerId || !loserTeamPlayerId) {
        return NextResponse.json({ error: "survivorTeamPlayerId and loserTeamPlayerId are required" }, { status: 400 });
      }
      const result = await mergeTeamPlayers({ survivorTeamPlayerId, loserTeamPlayerId, adminId });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "createMissingPlayer") {
      const enrollmentId = String(body.enrollmentId || "");
      if (!enrollmentId) {
        return NextResponse.json({ error: "enrollmentId is required" }, { status: 400 });
      }
      const teamId = typeof body.teamId === "string" && body.teamId ? body.teamId : null;
      const result = await createMissingTeamPlayerFromEnrollment({ enrollmentId, teamId, adminId });
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ error: `Unknown action: ${String(action)}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update player name collision review";
    console.error("[player-name-collisions POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
