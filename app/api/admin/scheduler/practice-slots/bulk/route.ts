import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { assignmentsFromBoard, type PracticeBoardCell } from "@/lib/scheduler/practiceBoard";
import { replaceDivisionPracticeSlots } from "@/lib/scheduler/practiceSlotWrite";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json()) as {
    organizationId?: string;
    seasonYear?: number;
    ageGroup?: string;
    durationMinutes?: number;
    cycleWeeks?: number;
    cells?: PracticeBoardCell[];
  };

  const organizationId = body.organizationId?.trim() || "";
  const seasonYear = Number(body.seasonYear);
  const ageGroup = body.ageGroup?.trim() || "";
  const durationMinutes = Number(body.durationMinutes) || 45;
  const cycleWeeks = Math.max(1, Number(body.cycleWeeks) || 1);
  const cells = Array.isArray(body.cells) ? body.cells : [];

  if (!organizationId || !Number.isFinite(seasonYear) || !ageGroup) {
    return NextResponse.json({ error: "organizationId, seasonYear, and ageGroup are required" }, { status: 400 });
  }

  const assignments = assignmentsFromBoard(cells, durationMinutes, cycleWeeks);
  const result = await replaceDivisionPracticeSlots({
    organizationId,
    seasonYear,
    ageGroup,
    assignments,
  });
  return NextResponse.json({ ok: true, ...result, assignmentCount: assignments.length });
}
