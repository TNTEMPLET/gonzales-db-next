import { NextRequest, NextResponse } from "next/server";

import { runScheduleManagerLiveAfterFinals } from "@/lib/gamechanger/schedule-manager/runLiveAfterFinals";
import { syncGameChangerToProject } from "@/lib/gamechanger/syncGameChangerToProject";
import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import prisma from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteParams) {
  return handleSync(request, ctx, { autoImport: true });
}

export async function POST(request: NextRequest, ctx: RouteParams) {
  return handleSync(request, ctx, { forceImportCompleted: true });
}

async function handleSync(
  request: NextRequest,
  ctx: RouteParams,
  options: { autoImport?: boolean; forceImportCompleted?: boolean },
) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const row = await prisma.bracketProject.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = safeParseBracketSpec(row.spec);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.issues }, { status: 500 });
  }

  try {
    const result = await syncGameChangerToProject(parsed.spec, options);

    if (result.specUpdated) {
      await prisma.bracketProject.update({
        where: { id },
        data: { spec: JSON.parse(JSON.stringify(result.spec)) },
      });
    }

    const newlyFinalizedMatchIds = result.live.newlyFinalizedMatchIds ?? [];
    if (newlyFinalizedMatchIds.length > 0) {
      await runScheduleManagerLiveAfterFinals(id);
    }

    return NextResponse.json(result.live);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
