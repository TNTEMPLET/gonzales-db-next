import { NextRequest, NextResponse } from "next/server";

import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import prisma from "@/lib/prisma";
import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import { mergeBracketSpec, safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: RouteParams) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let body: { enabled?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
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
  const gc = bracketGameChangerSchema.safeParse(parsed.spec.gameChanger);
  if (!gc.success) {
    return NextResponse.json({ error: "Save a GameChanger widget before enabling Schedule Manager." }, { status: 400 });
  }

  const nextSpec = mergeBracketSpec(parsed.spec, {
    gameChanger: {
      ...gc.data,
      scheduleManagerEnabled: body.enabled,
    },
  });
  const updated = await prisma.bracketProject.update({
    where: { id },
    data: { spec: JSON.parse(JSON.stringify(nextSpec)) },
  });

  return NextResponse.json({ data: updated });
}
