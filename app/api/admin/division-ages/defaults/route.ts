import { NextRequest, NextResponse } from "next/server";

import { getLeagueDefaults, saveLeagueDefaults } from "@/lib/ageDivisions/store";

import { guardDivisionAges } from "../guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = await guardDivisionAges(request, false);
  if (!guard.ok) return guard.response;
  try {
    const defaults = await getLeagueDefaults(guard.org);
    return NextResponse.json({
      organizationId: guard.org,
      canEdit: guard.canEdit,
      ...defaults,
    });
  } catch (error) {
    console.error("[division-ages] league defaults read failed", error);
    return NextResponse.json({ error: "Could not load league defaults." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await guardDivisionAges(request, true);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => null);
  try {
    const saved = await saveLeagueDefaults(guard.org, body, guard.adminId);
    if (!saved.ok) {
      return NextResponse.json(
        { error: saved.error, issues: saved.issues ?? [] },
        { status: saved.status },
      );
    }
    return NextResponse.json({
      organizationId: guard.org,
      canEdit: true,
      ...saved.value,
    });
  } catch (error) {
    console.error("[division-ages] league defaults save failed", error);
    return NextResponse.json({ error: "Could not save league defaults." }, { status: 500 });
  }
}
