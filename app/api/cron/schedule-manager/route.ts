import { NextRequest, NextResponse } from "next/server";

import { runScheduleManager } from "@/lib/gamechanger/schedule-manager/runScheduleManager";
import type { ScheduleManagerRunMode } from "@/lib/gamechanger/schedule-manager/types";
import prisma from "@/lib/prisma";

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.SCHEDULE_MANAGER_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const running = await prisma.scheduleManagerJob.findFirst({
    where: { status: "RUNNING" },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (running) {
    return NextResponse.json({ data: { skipped: true, reason: "job_already_running", jobId: running.id } });
  }

  const mode: ScheduleManagerRunMode =
    process.env.SCHEDULE_MANAGER_CRON_LIVE === "true" &&
    process.env.GAMECHANGER_SCHEDULE_WRITER_ENABLED === "true"
      ? "LIVE"
      : "CRON";
  const result = await runScheduleManager({ mode });
  return NextResponse.json({ data: result, mode });
}
