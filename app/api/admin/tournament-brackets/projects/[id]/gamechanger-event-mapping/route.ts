import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { gameChangerEventMappingSourcesFromSpec, normalizeMatchEventPinsDraft } from "@/lib/gamechanger/eventMappingSources";
import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import { mergeBracketSpec, safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import prisma from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

const savePinsBodySchema = z.object({
  matchEventPins: z.record(z.string().min(1), z.union([z.string().uuid(), z.null()])),
});

export async function GET(request: NextRequest, ctx: RouteParams) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const row = await prisma.bracketProject.findUnique({
    where: { id },
    select: { id: true, name: true, spec: true },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = safeParseBracketSpec(row.spec);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.issues }, { status: 500 });
  }

  const sources = await gameChangerEventMappingSourcesFromSpec(parsed.spec);

  return NextResponse.json({
    projectId: row.id,
    projectName: row.name,
    ...sources,
  });
}

export async function POST(request: NextRequest, ctx: RouteParams) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const row = await prisma.bracketProject.findUnique({
    where: { id },
    select: { id: true, spec: true },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = safeParseBracketSpec(row.spec);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.issues }, { status: 500 });
  }

  const gcParsed = bracketGameChangerSchema.safeParse(parsed.spec.gameChanger);
  if (!gcParsed.success) {
    return NextResponse.json(
      { error: "Configure a GameChanger widget on this bracket before pinning events." },
      { status: 400 },
    );
  }

  let body: z.infer<typeof savePinsBodySchema>;
  try {
    const json: unknown = await request.json();
    body = savePinsBodySchema.parse(json);
  } catch (err: unknown) {
    const message = err instanceof z.ZodError ? err.issues.map((i) => i.message).join("; ") : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const normalizedPins = normalizeMatchEventPinsDraft(body.matchEventPins);
  const gcNext = { ...gcParsed.data };
  if (Object.keys(normalizedPins).length > 0) {
    gcNext.matchEventPins = normalizedPins;
  } else {
    delete gcNext.matchEventPins;
  }
  const nextSpec = mergeBracketSpec(parsed.spec, { gameChanger: gcNext });

  await prisma.bracketProject.update({
    where: { id: row.id },
    data: { spec: nextSpec },
  });

  const sources = await gameChangerEventMappingSourcesFromSpec(nextSpec);

  return NextResponse.json({
    ok: true,
    projectId: row.id,
    ...sources,
  });
}
