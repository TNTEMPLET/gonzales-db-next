import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { runTournamentMonitor } from "@/lib/tournament-monitor/runTournamentMonitor";

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.TOURNAMENT_MONITOR_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const running = await prisma.tournamentMonitorRun.findFirst({
    where: { status: "RUNNING" },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (running) {
    return NextResponse.json({ data: { skipped: true, reason: "monitor_already_running", runId: running.id } });
  }

  const result = await runTournamentMonitor();
  return NextResponse.json({ data: result });
}
