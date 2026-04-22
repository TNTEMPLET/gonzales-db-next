import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureNewsAdmin } from "@/lib/news/auth";
import prisma from "@/lib/prisma";

type SaveScorePayload = {
  gameExternalId?: string;
  ageGroup?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  gameDate?: string | null;
  gameStatus?: string;
  homeScore?: number;
  awayScore?: number;
};

function toValidScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.floor(value);
}

export async function GET(request: NextRequest) {
  const auth = await ensureNewsAdmin(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const orgId = process.env.SITE_ORG ?? "gonzales";
  const scores = await prisma.gameScore.findMany({
    where: { organizationId: orgId },
    orderBy: [{ gameDate: "asc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({ data: scores });
}

export async function POST(request: NextRequest) {
  const auth = await ensureNewsAdmin(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const admin = await getAdminUserFromRequest(request);

  try {
    const body = (await request.json()) as SaveScorePayload;
    const gameExternalId = body.gameExternalId?.trim() || "";
    const homeTeam = body.homeTeam?.trim() || "";
    const awayTeam = body.awayTeam?.trim() || "";
    const ageGroup = body.ageGroup?.trim() || null;
    const gameStatus = body.gameStatus?.trim().toUpperCase() || "";
    const homeScore = toValidScore(body.homeScore);
    const awayScore = toValidScore(body.awayScore);

    if (!gameExternalId || !homeTeam || !awayTeam) {
      return NextResponse.json(
        { error: "gameExternalId, homeTeam, and awayTeam are required" },
        { status: 400 },
      );
    }

    if (homeScore === null || awayScore === null) {
      return NextResponse.json(
        { error: "homeScore and awayScore must be non-negative numbers" },
        { status: 400 },
      );
    }

    if (gameStatus !== "A") {
      return NextResponse.json(
        { error: "Only active games (status A) can be scored" },
        { status: 400 },
      );
    }

    let gameDate: Date | null = null;
    if (body.gameDate) {
      const parsed = new Date(body.gameDate);
      if (!Number.isNaN(parsed.valueOf())) {
        gameDate = parsed;
      }
    }

    const orgId = process.env.SITE_ORG ?? "gonzales";
    const score = await prisma.gameScore.upsert({
      where: {
        organizationId_gameExternalId: {
          organizationId: orgId,
          gameExternalId,
        },
      },
      create: {
        organizationId: orgId,
        gameExternalId,
        ageGroup,
        homeTeam,
        awayTeam,
        gameDate,
        homeScore,
        awayScore,
        enteredByAdminId: admin?.id || null,
      },
      update: {
        ageGroup,
        homeTeam,
        awayTeam,
        gameDate,
        homeScore,
        awayScore,
        enteredByAdminId: admin?.id || null,
      },
    });

    return NextResponse.json({ success: true, data: score });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to save score: ${message}` },
      { status: 500 },
    );
  }
}
