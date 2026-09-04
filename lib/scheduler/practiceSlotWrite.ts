import prisma from "@/lib/prisma";
import { formatPracticePlanText } from "@/lib/scheduler/practicePlanText";
import { partnerStartTime, type PracticeAssignment } from "@/lib/scheduler/practiceBoard";

export async function regenerateTeamPracticePlan(teamId: string) {
  const slots = await prisma.teamPracticeSlot.findMany({
    where: { teamId },
    include: { park: { select: { name: true } }, field: { select: { name: true } } },
    orderBy: [{ notes: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
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

export async function replaceDivisionPracticeSlots(params: {
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
  assignments: PracticeAssignment[];
}): Promise<{ created: number; teams: number }> {
  const previous = await prisma.teamPracticeSlot.findMany({
    where: {
      organizationId: params.organizationId,
      seasonYear: params.seasonYear,
      ageGroup: params.ageGroup,
    },
    select: { teamId: true },
  });
  const affected = new Set<string>(previous.map((row) => row.teamId));

  await prisma.teamPracticeSlot.deleteMany({
    where: {
      organizationId: params.organizationId,
      seasonYear: params.seasonYear,
      ageGroup: params.ageGroup,
    },
  });

  let created = 0;
  for (const assignment of params.assignments) {
    const sharedFieldGroupId = assignment.pairWithTeamId
      ? `pair-${assignment.teamId}-${assignment.pairWithTeamId}-${assignment.dayOfWeek}-${assignment.startTime}-${assignment.notes ?? "w"}`
      : null;
    await prisma.teamPracticeSlot.create({
      data: {
        organizationId: params.organizationId,
        seasonYear: params.seasonYear,
        ageGroup: params.ageGroup,
        teamId: assignment.teamId,
        parkId: assignment.parkId,
        fieldId: assignment.fieldId,
        dayOfWeek: assignment.dayOfWeek,
        startTime: assignment.startTime,
        durationMinutes: assignment.durationMinutes,
        sharedFieldGroupId,
        notes: assignment.notes,
      },
    });
    created += 1;
    affected.add(assignment.teamId);
    if (assignment.pairWithTeamId) {
      await prisma.teamPracticeSlot.create({
        data: {
          organizationId: params.organizationId,
          seasonYear: params.seasonYear,
          ageGroup: params.ageGroup,
          teamId: assignment.pairWithTeamId,
          parkId: assignment.parkId,
          fieldId: assignment.fieldId,
          dayOfWeek: assignment.dayOfWeek,
          startTime: partnerStartTime(assignment.startTime, assignment.durationMinutes),
          durationMinutes: assignment.durationMinutes,
          sharedFieldGroupId,
          notes: assignment.notes,
        },
      });
      created += 1;
      affected.add(assignment.pairWithTeamId);
    }
  }

  await Promise.all([...affected].map(regenerateTeamPracticePlan));
  return { created, teams: affected.size };
}
