import { NextRequest, NextResponse } from "next/server";

import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { teamNameSourcesFromParsedSpec } from "@/lib/tournament-brackets/teamNameSourcesForProject";
import prisma from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteParams) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const row = await prisma.bracketProject.findUnique({
    where: { id },
    select: { id: true, name: true, organizationId: true, seasonYear: true, spec: true },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = safeParseBracketSpec(row.spec);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.issues }, { status: 500 });
  }

  const sources = await teamNameSourcesFromParsedSpec(parsed.spec, {
    organizationId: row.organizationId,
    seasonYear: row.seasonYear,
  });

  return NextResponse.json({
    projectId: row.id,
    projectName: row.name,
    ...sources,
  });
}
