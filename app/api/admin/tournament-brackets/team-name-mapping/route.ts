import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import { mergeBracketSpec, safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  applyTeamLabelRenames,
  type TeamLabelRename,
} from "@/lib/tournament-brackets/bracketTeamRename";
import { teamNameSourcesFromParsedSpec } from "@/lib/tournament-brackets/teamNameSourcesForProject";
import prisma from "@/lib/prisma";
import { isContentOrgId } from "@/lib/siteConfig";

const applyBodySchema = z.object({
  updates: z.array(
    z.object({
      projectId: z.string().min(1),
      renames: z.array(
        z.object({
          from: z.string().min(1),
          to: z.string().min(1),
        }),
      ),
    }),
  ),
});

export async function GET(request: NextRequest) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim();
  if (!organizationId || !isContentOrgId(organizationId)) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  const seasonYearParam = request.nextUrl.searchParams.get("seasonYear");
  const seasonYear =
    seasonYearParam != null && Number.isFinite(Number.parseInt(seasonYearParam, 10))
      ? Number.parseInt(seasonYearParam, 10)
      : undefined;

  const projects = await prisma.bracketProject.findMany({
    where: {
      organizationId,
      ...(seasonYear != null ? { seasonYear } : {}),
      status: { in: ["DRAFT", "READY"] },
    },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      status: true,
      seasonYear: true,
      spec: true,
    },
  });

  const data = await Promise.all(
    projects.map(async (row) => {
      const parsed = safeParseBracketSpec(row.spec);
      if (!parsed.ok) {
        return {
          projectId: row.id,
          projectName: row.name,
          status: row.status,
          seasonYear: row.seasonYear,
          error: parsed.issues,
          bracketLabels: [] as string[],
          gameChangerTeamNames: [] as string[],
          rosterTeamNames: [] as string[],
          candidateNames: [] as string[],
          suggestedMappings: [] as { from: string; to: string }[],
          gameChangerConfigured: false,
        };
      }

      const sources = await teamNameSourcesFromParsedSpec(parsed.spec, {
        organizationId,
        seasonYear: row.seasonYear,
      });

      return {
        projectId: row.id,
        projectName: row.name,
        status: row.status,
        seasonYear: row.seasonYear,
        ...sources,
      };
    }),
  );

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = applyBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
  }

  const results: { projectId: string; ok: boolean; renamedCount: number; error?: string }[] = [];

  for (const update of parsedBody.data.updates) {
    if (update.renames.length === 0) {
      results.push({ projectId: update.projectId, ok: true, renamedCount: 0 });
      continue;
    }

    try {
      const existing = await prisma.bracketProject.findUnique({ where: { id: update.projectId } });
      if (!existing) {
        results.push({ projectId: update.projectId, ok: false, renamedCount: 0, error: "Not found" });
        continue;
      }

      const parsed = safeParseBracketSpec(existing.spec);
      if (!parsed.ok) {
        results.push({
          projectId: update.projectId,
          ok: false,
          renamedCount: 0,
          error: parsed.issues,
        });
        continue;
      }

      const renames: TeamLabelRename[] = update.renames.map((r) => ({
        from: r.from.trim(),
        to: r.to.trim(),
      }));

      const next = applyTeamLabelRenames(parsed.spec, renames);
      const merged = mergeBracketSpec(parsed.spec, {
        rounds: next.rounds,
        teams: next.teams,
        ...(next.thirdPlaceGame ? { thirdPlaceGame: next.thirdPlaceGame } : {}),
      });

      await prisma.bracketProject.update({
        where: { id: update.projectId },
        data: { spec: JSON.parse(JSON.stringify(merged)) },
      });

      results.push({ projectId: update.projectId, ok: true, renamedCount: renames.length });
    } catch (err: unknown) {
      results.push({
        projectId: update.projectId,
        ok: false,
        renamedCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    results,
    ok: failed.length === 0,
  });
}
