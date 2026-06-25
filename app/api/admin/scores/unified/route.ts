import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { resolveAdminAssignrScope } from "@/lib/admin/assignrOrgScope";
import { listUnifiedScoreGames } from "@/lib/admin/unifiedScoreSources";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { SEASON_END_DATE, SEASON_START_DATE } from "@/lib/seasonConfig";
import { mergeMatchScoresIntoSpec } from "@/lib/tournament-brackets/bracketScoring";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { isBracketOrgId, isContentOrgId } from "@/lib/siteConfig";

type SaveUnifiedScorePayload = {
  sourceType?: "LEAGUE" | "TOURNAMENT";
  organizationId?: string;
  sourceKey?: string;
  matchId?: string;
  ageGroup?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  gameDate?: string | null;
  gameStatus?: string;
  homeScore?: number;
  awayScore?: number;
};
function validScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  const scope = resolveAdminAssignrScope(request.nextUrl.searchParams.get("org"));
  const seasonYear = Number.parseInt(request.nextUrl.searchParams.get("seasonYear") || String(new Date().getFullYear()), 10);
  const data = await listUnifiedScoreGames({ scope, seasonYear: Number.isFinite(seasonYear) ? seasonYear : new Date().getFullYear(), startDate: SEASON_START_DATE, endDate: SEASON_END_DATE });
  return NextResponse.json(data);
}
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  const admin = await getAdminUserFromRequest(request);
  const body = (await request.json()) as SaveUnifiedScorePayload;
  const sourceType = body.sourceType;
  const organizationId = body.organizationId?.trim() || "";
  const sourceKey = body.sourceKey?.trim() || "";
  const matchId = body.matchId?.trim() || "";
  const homeScore = validScore(body.homeScore);
  const awayScore = validScore(body.awayScore);
  if (!sourceType || !organizationId || !sourceKey || !matchId || homeScore == null || awayScore == null) {
    return NextResponse.json({ error: "sourceType, organizationId, sourceKey, matchId, homeScore, and awayScore are required." }, { status: 400 });
  }
  if (sourceType === "LEAGUE") {
    if (!isContentOrgId(organizationId)) return NextResponse.json({ error: "Invalid league organization." }, { status: 400 });
    if ((body.gameStatus || "A").trim().toUpperCase() !== "A") return NextResponse.json({ error: "Only active league games can be scored." }, { status: 400 });
    const gameDate = body.gameDate && !Number.isNaN(new Date(body.gameDate).valueOf()) ? new Date(body.gameDate) : null;
    const score = await prisma.gameScore.upsert({
      where: { organizationId_gameExternalId: { organizationId, gameExternalId: matchId } },
      create: { organizationId, gameExternalId: matchId, ageGroup: body.ageGroup?.trim() || null, homeTeam: body.homeTeam?.trim() || "Home Team", awayTeam: body.awayTeam?.trim() || "Away Team", gameDate, homeScore, awayScore, enteredByAdminId: admin?.id || null },
      update: { ageGroup: body.ageGroup?.trim() || null, homeTeam: body.homeTeam?.trim() || "Home Team", awayTeam: body.awayTeam?.trim() || "Away Team", gameDate, homeScore, awayScore, enteredByAdminId: admin?.id || null },
    });
    return NextResponse.json({ success: true, data: score });
  }
  if (!isBracketOrgId(organizationId)) return NextResponse.json({ error: "Invalid tournament organization." }, { status: 400 });
  const project = await prisma.bracketProject.findUnique({ where: { id: sourceKey } });
  if (!project || project.organizationId !== organizationId) return NextResponse.json({ error: "Tournament project not found." }, { status: 404 });
  const parsed = safeParseBracketSpec(project.spec);
  if (!parsed.ok) return NextResponse.json({ error: "Tournament bracket spec is invalid." }, { status: 500 });
  const winnerSide = homeScore === awayScore ? undefined : homeScore > awayScore ? "home" : "away";
  const nextSpec = mergeMatchScoresIntoSpec(parsed.spec, { [matchId]: { homeScore, awayScore, winnerSide } });
  const updated = await prisma.bracketProject.update({ where: { id: sourceKey }, data: { spec: JSON.parse(JSON.stringify(nextSpec)) } });
  return NextResponse.json({ success: true, data: updated });
}
