import "server-only";

import { prisma } from "@/lib/prisma";
import { listVolunteerCards } from "@/lib/volunteers/service";
import type { ContentOrgId } from "@/lib/siteConfig";
import { STANDARD_DIVISIONS } from "@/lib/sportsConnect/fallballDivisions";
import { sortTeamsManagementAgeGroups } from "@/lib/admin/teamsImportHelpers";
import {
  classifyDivisionRosterBuild,
  type DraftSessionStatusLike,
  type RosterBuildMethod,
} from "@/lib/admin/seasonSetup/divisionRosterStatus";

/** The two items with no clean auto-detect signal -- an admin checks these off manually. */
export const MANUAL_CHECKLIST_ITEM_KEYS = [
  "REGISTRATION_WINDOW_SET",
  "JERSEY_ORDERS_SUBMITTED",
] as const;
export type ManualChecklistItemKey = (typeof MANUAL_CHECKLIST_ITEM_KEYS)[number];

export function isManualChecklistItemKey(key: string): key is ManualChecklistItemKey {
  return (MANUAL_CHECKLIST_ITEM_KEYS as readonly string[]).includes(key);
}

export type SeasonSetupSubItem = {
  label: string;
  status: "COMPLETE" | "INCOMPLETE";
  href: string;
  method?: RosterBuildMethod | null;
  methodLabel?: string | null;
};

export type SeasonSetupItem = {
  key: string;
  label: string;
  status: "COMPLETE" | "INCOMPLETE" | "PARTIAL";
  progressLabel?: string;
  href: string;
  manual: boolean;
  subItems?: SeasonSetupSubItem[];
};

export type SeasonSetupChecklist = {
  organizationId: ContentOrgId;
  seasonYear: number;
  items: SeasonSetupItem[];
};

/**
 * Assembles the Season Setup Checklist for one org+season, mirroring
 * getNeedsAttentionSummary's shape: a plain async function that fans out
 * Promise.all across the relevant domain queries and hand-assembles a typed
 * item list, rather than a generic rules engine. Most items are computed
 * live from existing data with no stored state at all; only the two keys in
 * MANUAL_CHECKLIST_ITEM_KEYS read from SeasonSetupChecklistItem.
 */
export async function getSeasonSetupChecklist(
  organizationId: ContentOrgId,
  seasonYear: number,
): Promise<SeasonSetupChecklist> {
  const [
    manualItems,
    importRun,
    openCoachingLeads,
    coachCount,
    volunteerCards,
    divisionTeams,
    draftSessions,
    activeSchedule,
  ] = await Promise.all([
    prisma.seasonSetupChecklistItem.findMany({ where: { organizationId, seasonYear } }),
    prisma.sportsConnectImportRun.findFirst({
      where: { organizationId, seasonYear, status: "DONE" },
      orderBy: { completedAt: "desc" },
    }),
    prisma.coachingInterestSubmission.count({ where: { organizationId, status: "NEW" } }),
    prisma.registeredUserOrgProfile.count({ where: { organizationId, isCoach: true } }),
    listVolunteerCards({ organizationId, seasonYear, status: "ACTIVE" }),
    prisma.team.findMany({
      where: { organizationId, seasonYear },
      select: {
        ageGroup: true,
        teamName: true,
        _count: { select: { players: true } },
      },
    }),
    prisma.draftSession.findMany({
      where: { organizationId, seasonYear },
      select: { ageGroup: true, status: true },
    }),
    prisma.scheduleSeason.findFirst({ where: { organizationId, seasonYear, status: "ACTIVE" } }),
  ]);

  const manualByKey = new Map(manualItems.map((m) => [`${m.itemKey}|${m.ageGroup}`, m]));
  const registrationWindowSet = manualByKey.get("REGISTRATION_WINDOW_SET|")?.isComplete ?? false;

  const notReadyCount = volunteerCards.filter((c) => c.readiness !== "READY").length;

  const divisions = Array.from(
    new Set([
      ...divisionTeams.map((t) => t.ageGroup),
      ...draftSessions.map((d) => d.ageGroup),
      ...(divisionTeams.length === 0 && draftSessions.length === 0 ? STANDARD_DIVISIONS : []),
    ]),
  ).sort(sortTeamsManagementAgeGroups);
  const draftByAgeGroup = new Map(
    draftSessions.map((d) => [d.ageGroup, d.status as DraftSessionStatusLike]),
  );
  const teamsByAgeGroup = new Map<string, { teamName: string; playerCount: number }[]>();
  for (const team of divisionTeams) {
    const list = teamsByAgeGroup.get(team.ageGroup) ?? [];
    list.push({ teamName: team.teamName, playerCount: team._count.players });
    teamsByAgeGroup.set(team.ageGroup, list);
  }
  const rosterSubItems: SeasonSetupSubItem[] = divisions.map((ageGroup) => {
    const classified = classifyDivisionRosterBuild({
      ageGroup,
      teams: teamsByAgeGroup.get(ageGroup) ?? [],
      draftStatus: draftByAgeGroup.get(ageGroup),
    });
    return {
      label: classified.ageGroup,
      status: classified.status,
      href: classified.href,
      method: classified.method,
      methodLabel: classified.methodLabel,
    };
  });
  const rostersComplete = rosterSubItems.filter((d) => d.status === "COMPLETE").length;
  const draftedCount = rosterSubItems.filter((d) => d.method === "DRAFT" && d.status === "COMPLETE").length;
  const importedCount = rosterSubItems.filter(
    (d) => d.method === "DIRECT_IMPORT" && d.status === "COMPLETE",
  ).length;
  const rosterOpenCount = rosterSubItems.length - rostersComplete;

  const jerseyOrderSubItems: SeasonSetupSubItem[] = divisions.map((ageGroup) => {
    const complete = manualByKey.get(`JERSEY_ORDERS_SUBMITTED|${ageGroup}`)?.isComplete ?? false;
    return { label: ageGroup, status: complete ? "COMPLETE" : "INCOMPLETE", href: "/admin/teams" };
  });
  const jerseyOrdersComplete = jerseyOrderSubItems.filter((d) => d.status === "COMPLETE").length;

  const items: SeasonSetupItem[] = [
    {
      key: "REGISTRATION_WINDOW_SET",
      label: "Registration window configured",
      status: registrationWindowSet ? "COMPLETE" : "INCOMPLETE",
      href: "/admin/registration",
      manual: true,
    },
    {
      key: "REGISTRATION_DATA_IMPORTED",
      label: "Registration data imported",
      status: importRun ? "COMPLETE" : "INCOMPLETE",
      href: "/admin/sports-connect",
      manual: false,
    },
    {
      key: "COACHING_INTEREST_FOLLOWED_UP",
      label: "Coaching interest leads followed up",
      status: openCoachingLeads === 0 ? "COMPLETE" : "INCOMPLETE",
      progressLabel: openCoachingLeads > 0 ? `${openCoachingLeads} new` : undefined,
      href: "/admin/coaching-interest",
      manual: false,
    },
    {
      key: "COACHES_SYNCED",
      // Approximation: no dedicated "last synced" signal exists yet, so this
      // is "at least one coach profile exists" rather than "a sync job ran
      // successfully" -- easy to swap for a real signal if one gets added.
      label: "Coaches synced",
      status: coachCount > 0 ? "COMPLETE" : "INCOMPLETE",
      href: "/admin/volunteers",
      manual: false,
    },
    {
      key: "VOLUNTEER_COMPLIANCE_CURRENT",
      label: "Volunteer compliance current",
      status: volunteerCards.length === 0 ? "INCOMPLETE" : notReadyCount === 0 ? "COMPLETE" : "PARTIAL",
      progressLabel: `${volunteerCards.length - notReadyCount}/${volunteerCards.length} ready`,
      href: "/admin/volunteers",
      manual: false,
    },
    {
      key: "ROSTERS_BUILT",
      label: "Rosters built",
      status:
        rosterSubItems.length === 0
          ? "INCOMPLETE"
          : rostersComplete === rosterSubItems.length
            ? "COMPLETE"
            : "PARTIAL",
      progressLabel:
        rosterSubItems.length === 0
          ? undefined
          : `${draftedCount} drafted · ${importedCount} imported · ${rosterOpenCount} open`,
      href: "/admin/teams",
      manual: false,
      subItems: rosterSubItems,
    },
    {
      key: "JERSEY_ORDERS_SUBMITTED",
      label: "Jersey orders submitted",
      status:
        jerseyOrderSubItems.length === 0
          ? "INCOMPLETE"
          : jerseyOrdersComplete === jerseyOrderSubItems.length
            ? "COMPLETE"
            : "PARTIAL",
      progressLabel: `${jerseyOrdersComplete}/${jerseyOrderSubItems.length} divisions`,
      href: "/admin/teams",
      manual: true,
      subItems: jerseyOrderSubItems,
    },
    {
      key: "SCHEDULE_PUBLISHED",
      label: "Schedule published",
      status: activeSchedule ? "COMPLETE" : "INCOMPLETE",
      href: "/admin/scheduler",
      manual: false,
    },
  ];

  return { organizationId, seasonYear, items };
}
