import { NextRequest, NextResponse } from "next/server";

import { resolvePostedLeagueScoreWrite } from "@/lib/admin/parkDirector/enforceWrite";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { isContentOrgId } from "@/lib/siteConfig";

type BatchScoreItem = {
  organizationId?: string;
  matchId?: string;
  ageGroup?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  gameDate?: string | null;
  homeScore?: number;
  awayScore?: number;
};

function validScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SCORES");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }
  const admin = await getAdminUserFromRequest(request);

  const body = (await request.json()) as { scores?: BatchScoreItem[] };
  const items = Array.isArray(body.scores) ? body.scores : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "scores array is required." }, { status: 400 });
  }
  if (items.length > 200) {
    return NextResponse.json({ error: "Save at most 200 scores at a time." }, { status: 400 });
  }

  const ready = [];
  for (const item of items) {
    const organizationId = item.organizationId?.trim() || "";
    const matchId = item.matchId?.trim() || "";
    const homeScore = validScore(item.homeScore);
    const awayScore = validScore(item.awayScore);
    if (!isContentOrgId(organizationId) || !matchId || homeScore == null || awayScore == null) {
      return NextResponse.json(
        { error: "Each score needs organizationId, matchId, homeScore, and awayScore." },
        { status: 400 },
      );
    }
    const gameDate =
      item.gameDate && !Number.isNaN(new Date(item.gameDate).valueOf())
        ? new Date(item.gameDate)
        : null;
    ready.push({
      organizationId,
      matchId,
      homeScore,
      awayScore,
      gameDate,
      ageGroup: item.ageGroup,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
    });
  }

  const saved = [];
  for (const item of ready) {
    const target = await resolvePostedLeagueScoreWrite({
      adminUserId: auth.admin.id,
      isMaster: auth.admin.isMaster,
      matchId: item.matchId,
    });
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status });
    const leagueOrgId = target.organizationId;
    const score = await prisma.gameScore.upsert({
      where: { organizationId_gameExternalId: { organizationId: leagueOrgId, gameExternalId: item.matchId } },
      create: {
        organizationId: leagueOrgId,
        gameExternalId: item.matchId,
        ageGroup: item.ageGroup?.trim() || null,
        homeTeam: item.homeTeam?.trim() || "Home Team",
        awayTeam: item.awayTeam?.trim() || "Away Team",
        gameDate: item.gameDate,
        homeScore: item.homeScore,
        awayScore: item.awayScore,
        enteredByAdminId: admin?.id || null,
      },
      update: {
        ageGroup: item.ageGroup?.trim() || null,
        homeTeam: item.homeTeam?.trim() || "Home Team",
        awayTeam: item.awayTeam?.trim() || "Away Team",
        gameDate: item.gameDate,
        homeScore: item.homeScore,
        awayScore: item.awayScore,
        enteredByAdminId: admin?.id || null,
      },
    });
    saved.push(score);
  }

  return NextResponse.json({ success: true, savedCount: saved.length, data: saved });
}
