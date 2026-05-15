import { NextRequest, NextResponse } from "next/server";

import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import { mergeBracketSpec, parseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { fetchReferenceExcerpt } from "@/lib/tournament-brackets/referenceAllowlist";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json()) as { projectId?: string; url?: string };
  if (!body.projectId || !body.url) {
    return NextResponse.json({ error: "projectId and url are required" }, { status: 400 });
  }

  const project = await prisma.bracketProject.findUnique({ where: { id: body.projectId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const fetched = await fetchReferenceExcerpt(body.url);
  if (!fetched.ok) {
    return NextResponse.json({ error: fetched.error }, { status: 400 });
  }

  const spec = parseBracketSpec(project.spec);
  const next = mergeBracketSpec(spec, {
    referenceUrl: body.url,
    fetchedReferenceExcerpt: fetched.excerpt,
    ingestionWarnings: [
      ...spec.ingestionWarnings,
      `Reference page fetched (${fetched.excerpt.length} chars excerpt). Review for accuracy before export.`,
    ],
  });

  await prisma.bracketProject.update({
    where: { id: body.projectId },
    data: { spec: JSON.parse(JSON.stringify(next)) },
  });

  return NextResponse.json({
    data: {
      excerptChars: fetched.excerpt.length,
      contentType: fetched.contentType,
    },
  });
}
