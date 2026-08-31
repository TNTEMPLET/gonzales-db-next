import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";
import { formatPracticePlanText } from "@/lib/scheduler/practicePlanText";

export const dynamic = "force-dynamic";

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nextHour = Math.floor(total / 60) % 24;
  const nextMinute = total % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

/** Recomputes and persists Team.practicePlan from that team's current TeamPracticeSlot rows. */
async function regenerateTeamPracticePlan(teamId: string) {
  const slots = await prisma.teamPracticeSlot.findMany({
    where: { teamId },
    include: { park: { select: { name: true } }, field: { select: { name: true } } },
    orderBy: { dayOfWeek: "asc" },
  });

  const views = await Promise.all(
    slots.map(async (slot) => {
      let pairedTeamName: string | null = null;
      let isFirst: boolean | null = null;
      if (slot.sharedFieldGroupId) {
        const sibling = await prisma.teamPracticeSlot.findFirst({
          where: { sharedFieldGroupId: slot.sharedFieldGroupId, teamId: { not: teamId } },
          include: { team: { select: { teamName: true } } },
        });
        if (sibling) {
          pairedTeamName = sibling.team.teamName;
          isFirst = slot.startTime <= sibling.startTime;
        }
      }
      return {
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        parkName: slot.park?.name ?? null,
        fieldName: slot.field?.name ?? null,
        pairedTeamName,
        isFirst,
        notes: slot.notes,
      };
    }),
  );

  await prisma.team.update({
    where: { id: teamId },
    data: { practicePlan: formatPracticePlanText(views) || null },
  });
}

/** GET ?org=&seasonYear=&ageGroup= -- every real team in the division plus its current practice slot, if any. */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const organizationId = request.nextUrl.searchParams.get("org");
  const seasonYearParam = request.nextUrl.searchParams.get("seasonYear");
  const ageGroup = request.nextUrl.searchParams.get("ageGroup");
  const seasonYear = seasonYearParam ? Number(seasonYearParam) : Number.NaN;
  if (!organizationId || !Number.isFinite(seasonYear) || !ageGroup) {
    return NextResponse.json({ error: "org, seasonYear, and ageGroup are required" }, { status: 400 });
  }

  const teams = await prisma.team.findMany({
    where: { organizationId, seasonYear, ageGroup },
    orderBy: { teamName: "asc" },
    select: { id: true, teamName: true, practiceSlots: true },
  });

  const groupIds = Array.from(
    new Set(teams.flatMap((t) => t.practiceSlots.map((s) => s.sharedFieldGroupId).filter((v): v is string => !!v))),
  );
  const siblingsByGroup = new Map<string, { teamId: string; teamName: string }[]>();
  if (groupIds.length > 0) {
    const siblingSlots = await prisma.teamPracticeSlot.findMany({
      where: { sharedFieldGroupId: { in: groupIds } },
      include: { team: { select: { id: true, teamName: true } } },
    });
    for (const s of siblingSlots) {
      const list = siblingsByGroup.get(s.sharedFieldGroupId!) ?? [];
      list.push({ teamId: s.team.id, teamName: s.team.teamName });
      siblingsByGroup.set(s.sharedFieldGroupId!, list);
    }
  }

  return NextResponse.json({
    teams: teams.map((t) => {
      const slot = t.practiceSlots[0];
      if (!slot) return { teamId: t.id, teamName: t.teamName, slot: null };
      const siblings = slot.sharedFieldGroupId ? siblingsByGroup.get(slot.sharedFieldGroupId) ?? [] : [];
      const pairedTeam = siblings.find((s) => s.teamId !== t.id) ?? null;
      return {
        teamId: t.id,
        teamName: t.teamName,
        slot: {
          id: slot.id,
          parkId: slot.parkId,
          fieldId: slot.fieldId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes,
          notes: slot.notes,
          pairedTeamId: pairedTeam?.teamId ?? null,
          pairedTeamName: pairedTeam?.teamName ?? null,
        },
      };
    }),
  });
}

/**
 * POST creates/replaces the one practice slot for a team (an upsert, not an
 * append -- this MVP models exactly one primary weekly slot per team, which
 * matches the granularity Coach Corner and the Practice Matrix report both
 * need). Optionally pairs it with a second team who shares the same field
 * and goes on second, durationMinutes later.
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await request.json();
  const {
    organizationId,
    seasonYear,
    ageGroup,
    teamId,
    dayOfWeek,
    startTime,
    durationMinutes,
    parkId,
    fieldId,
    notes,
    pairWithTeamId,
  } = body as {
    organizationId?: string;
    seasonYear?: number;
    ageGroup?: string;
    teamId?: string;
    dayOfWeek?: number;
    startTime?: string;
    durationMinutes?: number;
    parkId?: string | null;
    fieldId?: string | null;
    notes?: string | null;
    pairWithTeamId?: string | null;
  };

  if (!organizationId || !seasonYear || !ageGroup || !teamId || dayOfWeek === undefined || !startTime) {
    return NextResponse.json(
      { error: "organizationId, seasonYear, ageGroup, teamId, dayOfWeek, and startTime are required" },
      { status: 400 },
    );
  }

  const duration = durationMinutes || 90;

  // Clear this team's existing slot(s); if it was previously paired, free
  // the old partner's group id too (they keep their own slot, just unpaired).
  const existing = await prisma.teamPracticeSlot.findMany({ where: { teamId } });
  const existingGroupIds = existing.map((s) => s.sharedFieldGroupId).filter((v): v is string => !!v);
  await prisma.teamPracticeSlot.deleteMany({ where: { teamId } });
  if (existingGroupIds.length > 0) {
    await prisma.teamPracticeSlot.updateMany({
      where: { sharedFieldGroupId: { in: existingGroupIds } },
      data: { sharedFieldGroupId: null },
    });
  }

  const sharedFieldGroupId = pairWithTeamId ? `pair-${teamId}-${pairWithTeamId}-${Date.now()}` : null;

  await prisma.teamPracticeSlot.create({
    data: {
      organizationId,
      seasonYear,
      ageGroup,
      teamId,
      parkId: parkId || null,
      fieldId: fieldId || null,
      dayOfWeek,
      startTime,
      durationMinutes: duration,
      sharedFieldGroupId,
      notes: notes || null,
    },
  });

  const affectedTeamIds = [teamId];

  if (pairWithTeamId) {
    await prisma.teamPracticeSlot.deleteMany({ where: { teamId: pairWithTeamId } });
    await prisma.teamPracticeSlot.create({
      data: {
        organizationId,
        seasonYear,
        ageGroup,
        teamId: pairWithTeamId,
        parkId: parkId || null,
        fieldId: fieldId || null,
        dayOfWeek,
        startTime: addMinutes(startTime, duration),
        durationMinutes: duration,
        sharedFieldGroupId,
        notes: notes || null,
      },
    });
    affectedTeamIds.push(pairWithTeamId);
  }

  await Promise.all(affectedTeamIds.map(regenerateTeamPracticePlan));

  return NextResponse.json({ ok: true });
}

/** DELETE ?slotId= -- removes one team's practice slot, unpairing its sibling if shared. */
export async function DELETE(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const slotId = request.nextUrl.searchParams.get("slotId");
  if (!slotId) {
    return NextResponse.json({ error: "slotId is required" }, { status: 400 });
  }

  const slot = await prisma.teamPracticeSlot.findUnique({ where: { id: slotId } });
  if (!slot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const affectedTeamIds = [slot.teamId];
  if (slot.sharedFieldGroupId) {
    const sibling = await prisma.teamPracticeSlot.findFirst({
      where: { sharedFieldGroupId: slot.sharedFieldGroupId, teamId: { not: slot.teamId } },
    });
    if (sibling) {
      affectedTeamIds.push(sibling.teamId);
      await prisma.teamPracticeSlot.update({ where: { id: sibling.id }, data: { sharedFieldGroupId: null } });
    }
  }

  await prisma.teamPracticeSlot.delete({ where: { id: slotId } });
  await Promise.all(affectedTeamIds.map(regenerateTeamPracticePlan));

  return NextResponse.json({ ok: true });
}
