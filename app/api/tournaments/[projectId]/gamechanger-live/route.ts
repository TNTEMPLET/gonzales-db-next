import { NextResponse } from "next/server";

import { collectLayoutMatchesForGc } from "@/lib/gamechanger/collectLayoutMatches";
import { fetchGameChangerScoreboardWindow } from "@/lib/gamechanger/fetchScoreboard";
import { buildLivePayloadFromEvents } from "@/lib/gamechanger/matchEventsToBracket";
import { bracketGameChangerSchema, type GcLiveMatchPayload } from "@/lib/gamechanger/types";
import prisma from "@/lib/prisma";
import { getDefaultContentOrg } from "@/lib/siteConfig";
import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const org = getDefaultContentOrg();

  const project = await prisma.bracketProject.findFirst({
    where: {
      id: projectId,
      organizationId: org,
      status: "READY",
    },
    select: { spec: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Bracket not found." }, { status: 404 });
  }

  const parsed = safeParseBracketSpec(project.spec);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid bracket configuration." }, { status: 500 });
  }

  const gcParsed = bracketGameChangerSchema.safeParse(parsed.spec.gameChanger);
  if (!gcParsed.success) {
    return NextResponse.json({ error: "GameChanger is not configured for this bracket." }, { status: 404 });
  }

  const { widgetId } = gcParsed.data;

  try {
    const layout = buildBracketLayout(parsed.spec);
    const bracketMatches = collectLayoutMatchesForGc(layout);
    const { response, events } = await fetchGameChangerScoreboardWindow(widgetId);
    const payload: GcLiveMatchPayload = buildLivePayloadFromEvents(
      bracketMatches,
      events,
      response.next_update,
    );

    return NextResponse.json({
      ...payload,
      organizationName: response.data.organization.name,
      polledAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "GameChanger fetch failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
