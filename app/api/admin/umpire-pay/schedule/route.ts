import { NextRequest, NextResponse } from "next/server";

import { loadFallBallPaySchedule, saveFallBallPaySchedule } from "@/lib/admin/fallBallUmpirePayStore";
import { DEFAULT_FALL_BALL_PAY_SCHEDULE, isFallBallOrg } from "@/lib/admin/fallBallUmpirePay";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { hasAdminRoleAtLeast } from "@/lib/auth/adminRoles";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { isContentOrgId, resolveAdminTargetOrg } from "@/lib/siteConfig";

async function authorizeRead(request: NextRequest) {
  const reports = await ensureAdminModule(request, "REPORTS");
  if (reports.ok) return reports;
  return ensureAdminModule(request, "SEASON_SETUP");
}

export async function GET(request: NextRequest) {
  const auth = await authorizeRead(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const org = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(org)) {
    return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
  }
  if (!isFallBallOrg(org)) {
    return NextResponse.json({
      organizationId: org,
      canEdit: false,
      schedule: null,
    });
  }

  const seasonYear = getSeasonConfigForOrg(org).year;
  const schedule = await loadFallBallPaySchedule({ org, seasonYear });
  return NextResponse.json({
    organizationId: org,
    seasonYear,
    canEdit: hasAdminRoleAtLeast(auth.role, "ADMIN"),
    schedule,
    defaultSchedule: DEFAULT_FALL_BALL_PAY_SCHEDULE,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorizeRead(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (!hasAdminRoleAtLeast(auth.role, "ADMIN")) {
    return NextResponse.json({ error: "Only admins can edit umpire pay rates" }, { status: 403 });
  }

  const org = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(org) || !isFallBallOrg(org)) {
    return NextResponse.json({ error: "Umpire pay schedule is only editable for Fall Ball" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { schedule?: unknown; seasonYear?: unknown };
  const seasonYear = getSeasonConfigForOrg(org).year;
  const schedule = await saveFallBallPaySchedule({
    org,
    seasonYear: typeof body.seasonYear === "number" ? body.seasonYear : seasonYear,
    schedule: body.schedule,
  });
  return NextResponse.json({
    organizationId: org,
    seasonYear,
    canEdit: true,
    schedule,
    defaultSchedule: DEFAULT_FALL_BALL_PAY_SCHEDULE,
  });
}
