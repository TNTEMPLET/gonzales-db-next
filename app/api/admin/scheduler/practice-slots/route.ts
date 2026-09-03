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
  if (!organizationId || !Number.isFinite(seasonYear)) {
    return NextResponse.json({ error: "org and seasonYear are required" }, { status: 400 });
  }

  if (!ageGroup) {
    const unallocated = { teamName: { equals: "Unallocated", mode: "insensitive" as const } };
    const [teamCount, teamsByDivision, assignedTeams] = await Promise.all([
      prisma.team.count({
        where: { organizationId, seasonYear, NOT: unallocated },
      }),
      prisma.team.groupBy({
        by: ["ageGroup"],
        where: { organizationId, seasonYear, NOT: unallocated },
        _count: { _all: true },
      }),
      prisma.teamPracticeSlot.groupBy({
        by: ["ageGroup", "teamId"],
        where: { organizationId, seasonYear },
      }),
    ]);
    const assignedMap = new Map<string, number>();
    for (const row of assignedTeams) {
      assignedMap.set(row.ageGroup, (assignedMap.get(row.ageGroup) ?? 0) + 1);
    }
    const divisions = teamsByDivision
      .map((row) => ({
        ageGroup: row.ageGroup,
        teamCount: row._count._all,
        assignedCount: assignedMap.get(row.ageGroup) ?? 0,
      }))
      .sort((a, b) => {
        const ageA = Number.parseInt(a.ageGroup, 10);
        const ageB = Number.parseInt(b.ageGroup, 10);
        if (Number.isFinite(ageA) && Number.isFinite(ageB) && ageA !== ageB) return ageA - ageB;
        return a.ageGroup.localeCompare(b.ageGroup);
      });
    const assignedCount = assignedTeams.length;
    return NextResponse.json({ assignedCount, teamCount, divisions });
  }

  const teams = await prisma.team.findMany({
    where: {
      organizationId,
      seasonYear,
      ageGroup,
      NOT: { teamName: { equals: "Unallocated", mode: "insensitive" } },
    },
    orderBy: { teamName: "asc" },
    select: {
      id: true,
      teamName: true,
      practiceSlots: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
    },
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
    teams: teams.map((t) => ({
      teamId: t.id,
      teamName: t.teamName,
      slots: t.practiceSlots.map((slot) => {
        const siblings = slot.sharedFieldGroupId ? siblingsByGroup.get(slot.sharedFieldGroupId) ?? [] : [];
        const pairedTeam = siblings.find((s) => s.teamId !== t.id) ?? null;
        return {
          id: slot.id,
          parkId: slot.parkId,
          fieldId: slot.fieldId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes,
          notes: slot.notes,
          pairedTeamId: pairedTeam?.teamId ?? null,
          pairedTeamName: pairedTeam?.teamName ?? null,
        };
      }),
    })),
  });
}

/**
 * POST creates one weekly practice day for a team, or updates that day when
 * slotId is sent. Extra days append; other nights on the same team (and the
 * partner's other nights) stay put. Pairing shares this one field/night --
 * the partner goes second, durationMinutes later.
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
    slotId,
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
    slotId?: string | null;
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

  if (pairWithTeamId && pairWithTeamId === teamId) {
    return NextResponse.json({ error: "A team cannot pair with itself" }, { status: 400 });
  }

  const duration = durationMinutes || 90;
  const park = parkId || null;
  const field = fieldId || null;
  const slotNotes = notes || null;
  const pairId = pairWithTeamId || null;
  const affectedTeamIds = new Set<string>([teamId]);

  const current = slotId ? await prisma.teamPracticeSlot.findUnique({ where: { id: slotId } }) : null;
  if (slotId && (!current || current.teamId !== teamId)) {
    return NextResponse.json({ error: "Practice slot not found" }, { status: 404 });
  }

  let previousSibling: { id: string; teamId: string } | null = null;
  if (current?.sharedFieldGroupId) {
    previousSibling = await prisma.teamPracticeSlot.findFirst({
      where: { sharedFieldGroupId: current.sharedFieldGroupId, teamId: { not: teamId } },
      select: { id: true, teamId: true },
    });
    if (previousSibling) affectedTeamIds.add(previousSibling.teamId);
  }

  const pairUnchanged = Boolean(pairId && previousSibling && previousSibling.teamId === pairId);
  const sharedFieldGroupId = pairId
    ? pairUnchanged && current?.sharedFieldGroupId
      ? current.sharedFieldGroupId
      : `pair-${teamId}-${pairId}-${Date.now()}`
    : null;

  if (previousSibling && !pairUnchanged) {
    await prisma.teamPracticeSlot.update({
      where: { id: previousSibling.id },
      data: { sharedFieldGroupId: null },
    });
  }

  const slotData = {
    organizationId,
    seasonYear,
    ageGroup,
    teamId,
    parkId: park,
    fieldId: field,
    dayOfWeek,
    startTime,
    durationMinutes: duration,
    sharedFieldGroupId,
    notes: slotNotes,
  };

  if (current) {
    await prisma.teamPracticeSlot.update({ where: { id: current.id }, data: slotData });
  } else {
    await prisma.teamPracticeSlot.create({ data: slotData });
  }

  if (pairId) {
    affectedTeamIds.add(pairId);
    const partnerStart = addMinutes(startTime, duration);
    const partnerData = {
      organizationId,
      seasonYear,
      ageGroup,
      teamId: pairId,
      parkId: park,
      fieldId: field,
      dayOfWeek,
      startTime: partnerStart,
      durationMinutes: duration,
      sharedFieldGroupId,
      notes: slotNotes,
    };
    if (pairUnchanged && previousSibling) {
      await prisma.teamPracticeSlot.update({ where: { id: previousSibling.id }, data: partnerData });
    } else {
      await prisma.teamPracticeSlot.create({ data: partnerData });
    }
  }

  await Promise.all([...affectedTeamIds].map(regenerateTeamPracticePlan));

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
