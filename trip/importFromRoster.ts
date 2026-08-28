import "server-only";

import {
  matchTeamPlayerForCandidate,
} from "@/lib/allStar/rosterContactExport";
import { splitPlayerName } from "@/lib/trip/validate";
import type { TripAnswers } from "@/lib/trip/types";
import prisma from "@/lib/prisma";

export type TripRosterImportRow = {
  playerFullName: string;
  ageGroup: string | null;
  team: string | null;
  jerseyNumber: string | null;
  candidateId: string;
  rosterSlot: "SELECTED" | "SECOND_TEAM";
  /** Prefill answers for parent form / Sheet export */
  answers: TripAnswers;
  contactMatched: boolean;
};

export type TripRosterCycleOption = {
  id: string;
  title: string | null;
  seasonYear: number;
  ageGroup: string;
  allStarAgeGroupLabel: string | null;
  selectedCount: number;
  secondTeamCount: number;
  label: string;
};

function cycleLabel(c: {
  title: string | null;
  seasonYear: number;
  ageGroup: string;
  allStarAgeGroupLabel: string | null;
}): string {
  const title = c.title?.trim();
  if (title) return title;
  const age = c.allStarAgeGroupLabel?.trim() || c.ageGroup;
  return `${c.seasonYear} ${age}`;
}

/** Cycles for an org that have at least one finalized roster player. */
export async function listFinalizedRosterCyclesForOrg(organizationId: string) {
  const cycles = await prisma.allStarBallotCycle.findMany({
    where: { organizationId },
    select: {
      id: true,
      title: true,
      seasonYear: true,
      ageGroup: true,
      allStarAgeGroupLabel: true,
    },
    orderBy: [{ seasonYear: "desc" }, { ageGroup: "asc" }, { title: "asc" }],
  });
  if (cycles.length === 0) return [] as TripRosterCycleOption[];

  const counts = await prisma.allStarCandidate.groupBy({
    by: ["ballotCycleId", "finalRosterOverride"],
    where: {
      ballotCycleId: { in: cycles.map((c) => c.id) },
      finalRosterOverride: { in: ["SELECTED", "SECOND_TEAM"] },
    },
    _count: { _all: true },
  });

  const byCycle = new Map<string, { selected: number; second: number }>();
  for (const row of counts) {
    const cur = byCycle.get(row.ballotCycleId) ?? { selected: 0, second: 0 };
    if (row.finalRosterOverride === "SELECTED") cur.selected = row._count._all;
    if (row.finalRosterOverride === "SECOND_TEAM") cur.second = row._count._all;
    byCycle.set(row.ballotCycleId, cur);
  }

  const out: TripRosterCycleOption[] = [];
  for (const c of cycles) {
    const tally = byCycle.get(c.id);
    if (!tally || (tally.selected === 0 && tally.second === 0)) continue;
    out.push({
      id: c.id,
      title: c.title,
      seasonYear: c.seasonYear,
      ageGroup: c.ageGroup,
      allStarAgeGroupLabel: c.allStarAgeGroupLabel,
      selectedCount: tally.selected,
      secondTeamCount: tally.second,
      label: cycleLabel(c),
    });
  }
  return out;
}

/**
 * Build import rows from finalized All-Star roster, enriched with TeamPlayer
 * guardian/jersey data when a unique match is found.
 */
export async function buildTripImportRowsFromFinalRoster(input: {
  organizationId: string;
  cycleId: string;
  /** Which final roster slots to include (default both) */
  slots?: Array<"SELECTED" | "SECOND_TEAM">;
}): Promise<{
  cycle: {
    id: string;
    label: string;
    seasonYear: number;
    ageGroup: string;
    organizationId: string;
  };
  rows: TripRosterImportRow[];
}> {
  const cycle = await prisma.allStarBallotCycle.findFirst({
    where: { id: input.cycleId, organizationId: input.organizationId },
    select: {
      id: true,
      title: true,
      seasonYear: true,
      ageGroup: true,
      allStarAgeGroupLabel: true,
      organizationId: true,
    },
  });
  if (!cycle) {
    throw new Error("Ballot cycle not found for this organization");
  }

  const slots = input.slots?.length
    ? input.slots
    : (["SELECTED", "SECOND_TEAM"] as const);

  const candidates = await prisma.allStarCandidate.findMany({
    where: {
      ballotCycleId: cycle.id,
      finalRosterOverride: { in: [...slots] },
    },
    select: {
      id: true,
      playerFullName: true,
      team: true,
      jerseyNumber: true,
      ageGroup: true,
      organizationId: true,
      finalRosterOverride: true,
    },
    orderBy: [{ finalRosterOverride: "asc" }, { team: "asc" }, { playerFullName: "asc" }],
  });

  const teamPlayers = await prisma.teamPlayer.findMany({
    where: {
      team: {
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
      },
    },
    select: {
      fullName: true,
      firstName: true,
      lastName: true,
      jerseyNumber: true,
      guardianEmail: true,
      guardianPhone: true,
      guardianFirstName: true,
      guardianLastName: true,
      contactPhone: true,
      team: {
        select: {
          teamName: true,
          seasonYear: true,
          ageGroup: true,
          organizationId: true,
        },
      },
    },
  });

  // matchTeamPlayerForCandidate expects TeamPlayerContact shape (no first/last guardian on type)
  // but we need guardian names — match by same logic then look up full row.
  const rows: TripRosterImportRow[] = [];

  for (const candidate of candidates) {
    const override =
      candidate.finalRosterOverride === "SECOND_TEAM" ? "SECOND_TEAM" : "SELECTED";

    const matched = matchTeamPlayerForCandidate(
      teamPlayers.map((p) => ({
        fullName: p.fullName,
        jerseyNumber: p.jerseyNumber,
        guardianEmail: p.guardianEmail,
        guardianPhone: p.guardianPhone,
        contactPhone: p.contactPhone,
        team: p.team,
      })),
      {
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: candidate.ageGroup || cycle.ageGroup,
        playerFullName: candidate.playerFullName,
        team: candidate.team,
        jerseyNumber: candidate.jerseyNumber,
      },
    );

    // Re-find full TeamPlayer for guardian first/last (match returns slim type)
    let fullPlayer: (typeof teamPlayers)[number] | null = null;
    if (matched) {
      fullPlayer =
        teamPlayers.find(
          (p) =>
            p.fullName === matched.fullName &&
            p.team.teamName === matched.team.teamName &&
            (p.jerseyNumber || "") === (matched.jerseyNumber || ""),
        ) ?? null;
    }

    const split = splitPlayerName(candidate.playerFullName);
    const firstName =
      fullPlayer?.firstName?.trim() || split.first || "";
    const lastName = fullPlayer?.lastName?.trim() || split.last || "";
    const jersey =
      (fullPlayer?.jerseyNumber || candidate.jerseyNumber || "").trim() || null;

    // Only set keys we actually know — empty strings would override prefill on the parent form.
    const answers: TripAnswers = {
      participant_type: "Player",
    };
    if (firstName) answers.first_name = firstName;
    if (lastName) answers.last_name = lastName;
    if (jersey) answers.uniform_number = jersey;
    const gEmail = fullPlayer?.guardianEmail?.trim() || "";
    const gFirst = fullPlayer?.guardianFirstName?.trim() || "";
    const gLast = fullPlayer?.guardianLastName?.trim() || "";
    if (gEmail) answers.guardian1_email = gEmail;
    if (gFirst) answers.guardian1_first_name = gFirst;
    if (gLast) answers.guardian1_last_name = gLast;

    rows.push({
      playerFullName: candidate.playerFullName.trim(),
      ageGroup: candidate.ageGroup || cycle.ageGroup || null,
      team: candidate.team || null,
      jerseyNumber: jersey,
      candidateId: candidate.id,
      rosterSlot: override,
      answers,
      contactMatched: Boolean(
        fullPlayer?.guardianEmail?.trim() ||
          fullPlayer?.guardianFirstName?.trim() ||
          fullPlayer?.guardianLastName?.trim(),
      ),
    });
  }

  return {
    cycle: {
      id: cycle.id,
      label: cycleLabel(cycle),
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
      organizationId: cycle.organizationId,
    },
    rows,
  };
}
