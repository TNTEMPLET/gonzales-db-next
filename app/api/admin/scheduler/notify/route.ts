import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import {
  loadCoachScheduleNotify,
  sendCoachScheduleEmails,
  sendCoachScheduleSample,
} from "@/lib/scheduler/coachScheduleNotify";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

function organizationIdFrom(request: NextRequest) {
  return resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const seasonId = request.nextUrl.searchParams.get("seasonId")?.trim();
  if (!seasonId) {
    return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
  }

  try {
    const data = await loadCoachScheduleNotify({
      organizationId: organizationIdFrom(request),
      seasonId,
    });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load coach notify preview";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    seasonId?: string;
    teamIds?: string[];
    sampleEmail?: string;
    teamId?: string;
  };
  const seasonId = body.seasonId?.trim();
  if (!seasonId) {
    return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
  }

  try {
    if (body.sampleEmail?.trim()) {
      const sample = await sendCoachScheduleSample({
        organizationId: organizationIdFrom(request),
        seasonId,
        sampleEmail: body.sampleEmail,
        teamId: body.teamId?.trim() || null,
        actorAdminId: auth.admin.id,
        replyTo: auth.admin.email,
      });
      return NextResponse.json({ ok: true, sample: true, ...sample });
    }

    const result = await sendCoachScheduleEmails({
      organizationId: organizationIdFrom(request),
      seasonId,
      teamIds: Array.isArray(body.teamIds) ? body.teamIds : null,
      actorAdminId: auth.admin.id,
      replyTo: auth.admin.email,
    });
    if (!result.readyCount) {
      return NextResponse.json(
        { error: "No head coaches with email are ready to notify.", ...result },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to email coaches";
    const status = /disabled/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
