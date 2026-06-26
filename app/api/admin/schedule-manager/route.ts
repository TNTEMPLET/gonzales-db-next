import { NextRequest, NextResponse } from "next/server";

import { runScheduleManager } from "@/lib/gamechanger/schedule-manager/runScheduleManager";
import prisma from "@/lib/prisma";
import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";

export async function GET(request: NextRequest) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const bracketProjectId = request.nextUrl.searchParams.get("bracketProjectId")?.trim();
  const [jobs, actions] = await Promise.all([
    prisma.scheduleManagerJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        mode: true,
        status: true,
        totalCount: true,
        createdCount: true,
        skippedCount: true,
        failedCount: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    bracketProjectId
      ? prisma.scheduleManagerAction.findMany({
          where: { bracketProjectId },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: {
            id: true,
            matchId: true,
            gameNumber: true,
            homeTeam: true,
            awayTeam: true,
            status: true,
            gameChangerEventId: true,
            errorMessage: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ data: { jobs, actions } });
}

export async function POST(request: NextRequest) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let body: {
    action?: string;
    bracketProjectId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action === "run-once" ? "run-once" : body.action === "dry-run" ? "dry-run" : null;
  if (!action) {
    return NextResponse.json({ error: "action must be dry-run or run-once" }, { status: 400 });
  }

  try {
    const result = await runScheduleManager({
      mode: action === "run-once" ? "LIVE" : "DRY_RUN",
      createdByAdminId: auth.adminUserId,
      bracketProjectId: body.bracketProjectId?.trim() || undefined,
    });
    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
