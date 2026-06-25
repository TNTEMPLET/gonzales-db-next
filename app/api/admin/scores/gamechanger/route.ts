import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { upsertScoreboardConnection } from "@/lib/gamechanger/scoreboardConnections";
import { normalizeSourceKey } from "@/lib/gamechanger/unifiedScoreSync";
import { ensureAdminModule } from "@/lib/news/auth";
import { isBracketOrgId } from "@/lib/siteConfig";

type Body = {
  organizationId?: string;
  seasonYear?: number;
  sourceType?: "LEAGUE" | "TOURNAMENT";
  sourceKey?: string;
  sourceLabel?: string;
  widgetId?: string;
  maxVerticalGamesVisible?: number | null;
  autoImportFinalScores?: boolean;
};
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  const admin = await getAdminUserFromRequest(request);
  const body = (await request.json()) as Body;
  if (!body.sourceType || !body.organizationId || !isBracketOrgId(body.organizationId)) return NextResponse.json({ error: "Valid organization and source type are required." }, { status: 400 });
  const seasonYear = typeof body.seasonYear === "number" && Number.isFinite(body.seasonYear) ? Math.trunc(body.seasonYear) : new Date().getFullYear();
  const sourceKey = normalizeSourceKey(body.sourceType, body.sourceKey || "");
  if (!sourceKey) return NextResponse.json({ error: "Source key is required." }, { status: 400 });
  const widgetId = body.widgetId?.trim() || "";
  if (!widgetId) return NextResponse.json({ error: "GameChanger widget ID is required." }, { status: 400 });
  const max = typeof body.maxVerticalGamesVisible === "number" && Number.isFinite(body.maxVerticalGamesVisible) ? Math.trunc(body.maxVerticalGamesVisible) : null;
  const data = await upsertScoreboardConnection({ organizationId: body.organizationId, seasonYear, sourceType: body.sourceType, sourceKey, sourceLabel: body.sourceLabel, widgetId, maxVerticalGamesVisible: max, autoImportFinalScores: body.autoImportFinalScores ?? true, createdByAdminId: admin?.id || null });
  return NextResponse.json({ success: true, data });
}
