import { NextRequest, NextResponse } from "next/server";

import { validateSeasonWrite } from "@/lib/ageDivisions/schema";
import {
  clearSeasonDivisionAges,
  getSeasonDivisionAges,
  saveSeasonDivisionAges,
} from "@/lib/ageDivisions/store";

import { guardDivisionAges, readSeasonYear } from "../guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = await guardDivisionAges(request, false);
  if (!guard.ok) return guard.response;
  const seasonYear = readSeasonYear(request);
  if (seasonYear == null) {
    return NextResponse.json({ error: "seasonYear must be a four-digit year." }, { status: 400 });
  }
  try {
    const table = await getSeasonDivisionAges(guard.org, seasonYear);
    return NextResponse.json({
      organizationId: guard.org,
      seasonYear,
      canEdit: guard.canEdit,
      ...table,
    });
  } catch (error) {
    console.error("[division-ages] season read failed", error);
    return NextResponse.json({ error: "Could not load division ages." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await guardDivisionAges(request, true);
  if (!guard.ok) return guard.response;
  const seasonYear = readSeasonYear(request);
  if (seasonYear == null) {
    return NextResponse.json({ error: "seasonYear must be a four-digit year." }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = validateSeasonWrite(body, seasonYear);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, issues: parsed.issues }, { status: 400 });
  }
  try {
    const saved = parsed.data.reset
      ? await clearSeasonDivisionAges(guard.org, seasonYear, guard.adminId)
      : await saveSeasonDivisionAges(
          guard.org,
          seasonYear,
          {
            cutoff: parsed.data.cutoff,
            divisions: parsed.data.divisions,
            confirm: parsed.data.confirm,
          },
          guard.adminId,
        );
    if (!saved.ok) {
      return NextResponse.json(
        { error: saved.error, issues: saved.issues ?? [] },
        { status: saved.status },
      );
    }
    return NextResponse.json({
      organizationId: guard.org,
      seasonYear,
      canEdit: true,
      ...saved.value,
    });
  } catch (error) {
    console.error("[division-ages] season save failed", error);
    return NextResponse.json({ error: "Could not save division ages." }, { status: 500 });
  }
}
