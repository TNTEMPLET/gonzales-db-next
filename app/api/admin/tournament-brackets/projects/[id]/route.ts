import { NextRequest, NextResponse } from "next/server";

import { routeErrorMessage } from "@/lib/api/routeErrorMessage";
import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import { mergeBracketSpec, safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import prisma from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteParams) {
  try {
    const auth = await ensureTournamentBracketsMaster(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { id } = await ctx.params;
    const row = await prisma.bracketProject.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const probe = safeParseBracketSpec(row.spec);
    if (!probe.ok) {
      console.warn(`[bracket-spec] GET bracketProject/${id}: stored spec invalid — ${probe.issues}`);
    }
    return NextResponse.json({ data: row });
  } catch (err: unknown) {
    return NextResponse.json({ error: routeErrorMessage(err, "Failed to load bracket project") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: RouteParams) {
  try {
    const auth = await ensureTournamentBracketsMaster(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { id } = await ctx.params;
    let body: {
      name?: string;
      status?: "DRAFT" | "READY" | "ARCHIVED";
      priority?: number;
      specPatch?: Record<string, unknown>;
      sourceArtifactUrls?: string[];
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const existing = await prisma.bracketProject.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: {
      name?: string;
      status?: "DRAFT" | "READY" | "ARCHIVED";
      priority?: number;
      spec?: object;
      sourceArtifactUrls?: object;
    } = {};

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.status) data.status = body.status;
    if (typeof body.priority === "number" && Number.isFinite(body.priority)) {
      data.priority = Math.trunc(body.priority);
    }

    if (body.specPatch && typeof body.specPatch === "object") {
      const existingProbe = safeParseBracketSpec(existing.spec);
      if (!existingProbe.ok) {
        console.warn(
          `[bracket-spec] PATCH bracketProject/${id}: existing stored spec was invalid before merge — ${existingProbe.issues}`,
        );
      }
      const hadStructuredRounds = existingProbe.spec.rounds.some((r) => r.matches.length > 0);
      let merged;
      try {
        merged = mergeBracketSpec(existingProbe.spec, body.specPatch);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 400 });
      }
      const savedHasRounds = merged.rounds.some((r) => r.matches.length > 0);
      if (hadStructuredRounds && !savedHasRounds) {
        return NextResponse.json(
          {
            error:
              "Save would remove all bracket rounds. Re-open Bracket structure and try again, or restore from a backup export.",
          },
          { status: 400 },
        );
      }
      data.spec = JSON.parse(JSON.stringify(merged));
    }

    if (Array.isArray(body.sourceArtifactUrls)) {
      data.sourceArtifactUrls = body.sourceArtifactUrls;
    }

    const updated = await prisma.bracketProject.update({
      where: { id },
      data,
    });

    return NextResponse.json({ data: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: routeErrorMessage(err, "Failed to save bracket project") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: RouteParams) {
  try {
    const auth = await ensureTournamentBracketsMaster(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { id } = await ctx.params;
    const existing = await prisma.bracketProject.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.bracketProject.delete({ where: { id } });
    return NextResponse.json({ data: { deleted: true, id } });
  } catch (err: unknown) {
    return NextResponse.json({ error: routeErrorMessage(err, "Failed to delete bracket project") }, { status: 500 });
  }
}
