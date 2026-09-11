import { NextRequest, NextResponse } from "next/server";

import {
  getTeamsManagementAgeGroupDefaults,
  mergeTeamsManagementAgeGroupOptions,
  type TeamsOrgId,
} from "@/lib/admin/teamsImportHelpers";
import { resolveCommunicationActor } from "@/lib/communications/authz";
import prisma from "@/lib/prisma";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import type { ContentOrgId } from "@/lib/siteConfig";

export async function GET(request: NextRequest) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });

  const org = actor.targetOrg as ContentOrgId;
  const season = getSeasonConfigForOrg(org);
  const seasonYear = season.year;
  const defaults = getTeamsManagementAgeGroupDefaults(org as TeamsOrgId);

  const [teams, enrollments] = await Promise.all([
    prisma.team.findMany({
      where: { organizationId: org, seasonYear },
      select: {
        ageGroup: true,
        coachAssignments: { select: { registeredUserId: true } },
      },
    }),
    prisma.enrollment.findMany({
      where: { organizationId: org, seasonYear },
      select: { ageGroup: true, guardianEmail: true },
    }),
  ]);

  const coachIdsByDivision = new Map<string, Set<string>>();
  for (const team of teams) {
    const set = coachIdsByDivision.get(team.ageGroup) ?? new Set<string>();
    for (const assignment of team.coachAssignments) set.add(assignment.registeredUserId);
    coachIdsByDivision.set(team.ageGroup, set);
  }

  const parentEmailsByDivision = new Map<string, Set<string>>();
  for (const row of enrollments) {
    const email = row.guardianEmail?.trim().toLowerCase() || "";
    if (!email) continue;
    const set = parentEmailsByDivision.get(row.ageGroup) ?? new Set<string>();
    set.add(email);
    parentEmailsByDivision.set(row.ageGroup, set);
  }

  const extraAgeGroups = [
    ...teams.map((team) => team.ageGroup),
    ...enrollments.map((row) => row.ageGroup),
  ];
  const ageGroups = mergeTeamsManagementAgeGroupOptions(defaults, extraAgeGroups);

  return NextResponse.json({
    seasonYear,
    seasonLabel: season.label,
    divisions: ageGroups.map((ageGroup) => ({
      ageGroup,
      coachCount: coachIdsByDivision.get(ageGroup)?.size ?? 0,
      parentCount: parentEmailsByDivision.get(ageGroup)?.size ?? 0,
    })),
  });
}
