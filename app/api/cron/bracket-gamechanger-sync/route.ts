import { NextRequest, NextResponse } from "next/server";

import { runScheduleManager } from "@/lib/gamechanger/schedule-manager/runScheduleManager";
import { syncGameChangerToProject } from "@/lib/gamechanger/syncGameChangerToProject";
import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import prisma from "@/lib/prisma";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.SCHEDULE_MANAGER_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim() || "ladistrict2";
  const projects = await prisma.bracketProject.findMany({
    where: { organizationId, status: "READY" },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    select: { id: true, name: true, spec: true },
  });

  const synced: Array<{
    id: string;
    name: string;
    importedMatchIds: string[];
    scheduleManager?: { createdCount: number; skippedCount: number; failedCount: number };
  }> = [];

  for (const project of projects) {
    const parsed = safeParseBracketSpec(project.spec);
    if (!parsed.ok) continue;
    const gc = bracketGameChangerSchema.safeParse(parsed.spec.gameChanger);
    if (!gc.success || !gc.data.widgetId) continue;

    const syncResult = await syncGameChangerToProject(parsed.spec, { autoImport: true });
    let importedMatchIds = syncResult.live.importedMatchIds ?? [];

    if (syncResult.specUpdated) {
      await prisma.bracketProject.update({
        where: { id: project.id },
        data: { spec: JSON.parse(JSON.stringify(syncResult.spec)) },
      });
    }

    let scheduleManagerSummary: { createdCount: number; skippedCount: number; failedCount: number } | undefined;
    if (gc.data.scheduleManagerEnabled && importedMatchIds.length > 0) {
      const liveWriterEnabled =
        process.env.GAMECHANGER_SCHEDULE_WRITER_ENABLED === "true" &&
        Boolean(process.env.GAMECHANGER_SCHEDULE_WRITER_ENDPOINT?.trim());
      if (liveWriterEnabled) {
        try {
          const sm = await runScheduleManager({
            mode: "LIVE",
            bracketProjectId: project.id,
          });
          scheduleManagerSummary = {
            createdCount: sm.createdCount,
            skippedCount: sm.skippedCount,
            failedCount: sm.failedCount,
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return NextResponse.json({ error: message, partial: synced }, { status: 500 });
        }
      }
    }

    synced.push({
      id: project.id,
      name: project.name,
      importedMatchIds,
      ...(scheduleManagerSummary ? { scheduleManager: scheduleManagerSummary } : {}),
    });
  }

  return NextResponse.json({ data: { organizationId, synced } });
}
