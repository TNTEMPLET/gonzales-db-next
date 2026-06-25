import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { importCompletedGameChangerScores, normalizeSourceKey } from "@/lib/gamechanger/unifiedScoreSync";
import { ensureAdminModule } from "@/lib/news/auth";
import { isBracketOrgId } from "@/lib/siteConfig";

type Body = { organizationId?: string; seasonYear?: number; sourceType?: "LEAGUE" | "TOURNAMENT"; sourceKey?: string };
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  const admin = await getAdminUserFromRequest(request);
  const body = (await request.json()) as Body;
  if (!body.sourceType || !body.organizationId || !isBracketOrgId(body.organizationId)) return NextResponse.json({ error: "Valid organization and source type are required." }, { status: 400 });
  const seasonYear = typeof body.seasonYear === "number" && Number.isFinite(body.seasonYear) ? Math.trunc(body.seasonYear) : new Date().getFullYear();
  const data = await importCompletedGameChangerScores({ organizationId: body.organizationId, seasonYear, sourceType: body.sourceType, sourceKey: normalizeSourceKey(body.sourceType, body.sourceKey || ""), enteredByAdminId: admin?.id || null });
  return NextResponse.json(data);
}
