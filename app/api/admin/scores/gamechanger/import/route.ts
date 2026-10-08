import { NextRequest, NextResponse } from "next/server";

import { parkDirectorActiveVenueIds, parkDirectorAllowedScheduleGameIds } from "@/lib/admin/parkDirector/enforceWrite";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { importCompletedGameChangerScores, normalizeSourceKey } from "@/lib/gamechanger/unifiedScoreSync";
import { loadScoreableGames } from "@/lib/schedule/scoreableGamesLoad";
import { ensureAdminModule } from "@/lib/news/auth";
import { isBracketOrgId, isContentOrgId } from "@/lib/siteConfig";

type Body = { organizationId?: string; seasonYear?: number; sourceType?: "LEAGUE" | "TOURNAMENT"; sourceKey?: string };
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  const admin = await getAdminUserFromRequest(request);
  const body = (await request.json()) as Body;
  if (!body.sourceType || !body.organizationId || !isBracketOrgId(body.organizationId)) return NextResponse.json({ error: "Valid organization and source type are required." }, { status: 400 });
  const seasonYear = typeof body.seasonYear === "number" && Number.isFinite(body.seasonYear) ? Math.trunc(body.seasonYear) : new Date().getFullYear();
  let allowedScheduleGameIds: ReadonlySet<string> | undefined;
  if (body.sourceType === "LEAGUE" && isContentOrgId(body.organizationId)) {
    const venues = await parkDirectorActiveVenueIds({
      adminUserId: auth.admin.id,
      isMaster: auth.admin.isMaster,
      role: auth.role,
    });
    if (venues !== "unrestricted") {
      const games = await loadScoreableGames(body.organizationId);
      const allowed = await parkDirectorAllowedScheduleGameIds({
        adminUserId: auth.admin.id,
        isMaster: auth.admin.isMaster,
        role: auth.role,
        scheduleDraftGameIds: games.map((game) => game.id),
      });
      if (allowed !== "unrestricted") allowedScheduleGameIds = allowed;
    }
  }
  const data = await importCompletedGameChangerScores({
    organizationId: body.organizationId,
    seasonYear,
    sourceType: body.sourceType,
    sourceKey: normalizeSourceKey(body.sourceType, body.sourceKey || ""),
    enteredByAdminId: admin?.id || null,
    allowedScheduleGameIds,
  });
  return NextResponse.json(data);
}
