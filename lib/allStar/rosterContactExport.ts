import type { PrismaClient } from "@prisma/client";

import {
  getRunoffVotePanelPrimaryTeamHeading,
  getRunoffVotePanelSecondaryTeamHeading,
} from "@/lib/allStar/cycleUiLabels";
import type { ContentOrgId } from "@/lib/siteConfig";

export type RosterContactRow = {
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
  cycleName: string;
  rosterSlot: string;
  playerFullName: string;
  team: string;
  jerseyNumber: string;
  guardianEmail: string;
  guardianPhone: string;
  playerContactPhone: string;
  contactEmail: string;
  emailMatchStatus: "matched" | "not_found";
};

type TeamPlayerContact = {
  fullName: string;
  jerseyNumber: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  contactPhone: string | null;
  team: {
    teamName: string;
    seasonYear: number;
    ageGroup: string;
    organizationId: string;
  };
};

export function normalizeRosterMatchKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeJerseyNumber(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  const lower = normalized.toLowerCase();
  if (!normalized || lower === "tbd" || lower === "n/a" || lower === "na") {
    return "";
  }
  return normalized;
}

function playerLookupKey(
  organizationId: string,
  seasonYear: number,
  ageGroup: string,
  playerFullName: string,
  team: string,
  jerseyNumber: string,
) {
  return [
    organizationId,
    String(seasonYear),
    normalizeRosterMatchKey(ageGroup),
    normalizeRosterMatchKey(playerFullName),
    normalizeRosterMatchKey(team),
    normalizeRosterMatchKey(jerseyNumber),
  ].join("::");
}

function matchWithinPlayerScope(
  scoped: TeamPlayerContact[],
  candidate: {
    organizationId: string;
    seasonYear: number;
    ageGroup: string;
    playerFullName: string;
    team: string;
    jerseyNumber: string;
  },
): TeamPlayerContact | null {
  if (scoped.length === 0) return null;

  const jersey = normalizeJerseyNumber(candidate.jerseyNumber);
  const exactKey = playerLookupKey(
    candidate.organizationId,
    candidate.seasonYear,
    candidate.ageGroup,
    candidate.playerFullName,
    candidate.team,
    jersey,
  );

  for (const player of scoped) {
    const key = playerLookupKey(
      candidate.organizationId,
      candidate.seasonYear,
      player.team.ageGroup,
      player.fullName,
      player.team.teamName,
      normalizeJerseyNumber(player.jerseyNumber),
    );
    if (
      normalizeRosterMatchKey(player.fullName) ===
        normalizeRosterMatchKey(candidate.playerFullName) &&
      normalizeRosterMatchKey(player.team.teamName) ===
        normalizeRosterMatchKey(candidate.team) &&
      normalizeJerseyNumber(player.jerseyNumber) === jersey
    ) {
      return player;
    }
    if (key === exactKey) return player;
  }

  const normalizedTeam = normalizeRosterMatchKey(candidate.team);
  const nameTeamMatches = scoped.filter((player) => {
    const playerTeam = normalizeRosterMatchKey(player.team.teamName);
    const playerName = normalizeRosterMatchKey(player.fullName);
    if (playerName !== normalizeRosterMatchKey(candidate.playerFullName)) {
      return false;
    }
    if (playerTeam === normalizedTeam) return true;
    if (normalizedTeam && (playerTeam.includes(normalizedTeam) || normalizedTeam.includes(playerTeam))) {
      return true;
    }
    return (
      normalizedTeam &&
      normalizeRosterMatchKey(player.team.ageGroup) === normalizedTeam
    );
  });
  if (nameTeamMatches.length === 1) return nameTeamMatches[0]!;

  if (jersey && nameTeamMatches.length > 1) {
    const jerseyMatch = nameTeamMatches.find(
      (player) => normalizeJerseyNumber(player.jerseyNumber) === jersey,
    );
    if (jerseyMatch) return jerseyMatch;
  }

  const nameJerseyMatches = scoped.filter(
    (player) =>
      normalizeRosterMatchKey(player.fullName) ===
        normalizeRosterMatchKey(candidate.playerFullName) &&
      (!jersey || normalizeJerseyNumber(player.jerseyNumber) === jersey),
  );
  if (nameJerseyMatches.length === 1) return nameJerseyMatches[0]!;

  const nameOnlyMatches = scoped.filter(
    (player) =>
      normalizeRosterMatchKey(player.fullName) ===
      normalizeRosterMatchKey(candidate.playerFullName),
  );
  if (nameOnlyMatches.length === 1) return nameOnlyMatches[0]!;

  return null;
}

export function matchTeamPlayerForCandidate(
  players: TeamPlayerContact[],
  candidate: {
    organizationId: string;
    seasonYear: number;
    ageGroup: string;
    playerFullName: string;
    team: string;
    jerseyNumber: string;
  },
): TeamPlayerContact | null {
  const ageScoped = players.filter(
    (player) =>
      player.team.organizationId === candidate.organizationId &&
      player.team.seasonYear === candidate.seasonYear &&
      normalizeRosterMatchKey(player.team.ageGroup) ===
        normalizeRosterMatchKey(candidate.ageGroup),
  );
  const ageMatch = matchWithinPlayerScope(ageScoped, candidate);
  if (ageMatch) return ageMatch;

  const seasonScoped = players.filter(
    (player) =>
      player.team.organizationId === candidate.organizationId &&
      player.team.seasonYear === candidate.seasonYear,
  );
  return matchWithinPlayerScope(seasonScoped, candidate);
}

function rosterSlotLabel(
  organizationId: string,
  cycleTitle: string | null,
  override: "SELECTED" | "SECOND_TEAM",
) {
  const orgId = organizationId as ContentOrgId;
  if (override === "SECOND_TEAM") {
    return getRunoffVotePanelSecondaryTeamHeading(orgId);
  }
  return getRunoffVotePanelPrimaryTeamHeading(orgId, cycleTitle);
}

function cycleDisplayName(cycle: {
  title: string | null;
  seasonYear: number;
  ageGroup: string;
}) {
  const title = cycle.title?.trim();
  return title || `${cycle.seasonYear} ${cycle.ageGroup}`;
}

function pickContactEmail(player: TeamPlayerContact | null) {
  const guardianEmail = player?.guardianEmail?.trim() || "";
  if (guardianEmail) return guardianEmail;
  return "";
}

export async function buildRosterContactRows(
  prisma: PrismaClient,
  options: {
    cycleId?: string;
    organizationId?: ContentOrgId;
    seasonYear?: number;
  },
): Promise<RosterContactRow[]> {
  const cycles = options.cycleId
    ? await prisma.allStarBallotCycle.findMany({
        where: { id: options.cycleId },
        select: {
          id: true,
          organizationId: true,
          seasonYear: true,
          ageGroup: true,
          title: true,
        },
      })
    : await prisma.allStarBallotCycle.findMany({
        where: {
          ...(options.organizationId ? { organizationId: options.organizationId } : {}),
          ...(options.seasonYear ? { seasonYear: options.seasonYear } : {}),
        },
        select: {
          id: true,
          organizationId: true,
          seasonYear: true,
          ageGroup: true,
          title: true,
        },
        orderBy: [
          { organizationId: "asc" },
          { seasonYear: "desc" },
          { ageGroup: "asc" },
        ],
      });

  if (cycles.length === 0) return [];

  const cycleIds = cycles.map((cycle) => cycle.id);
  const candidates = await prisma.allStarCandidate.findMany({
    where: {
      ballotCycleId: { in: cycleIds },
      finalRosterOverride: { in: ["SELECTED", "SECOND_TEAM"] },
    },
    select: {
      ballotCycleId: true,
      organizationId: true,
      ageGroup: true,
      playerFullName: true,
      team: true,
      jerseyNumber: true,
      finalRosterOverride: true,
    },
    orderBy: [{ team: "asc" }, { playerFullName: "asc" }],
  });

  if (candidates.length === 0) return [];

  const orgIds = [...new Set(cycles.map((cycle) => cycle.organizationId))];
  const seasonYears = [...new Set(cycles.map((cycle) => cycle.seasonYear))];

  const teamPlayers = await prisma.teamPlayer.findMany({
    where: {
      team: {
        organizationId: { in: orgIds },
        seasonYear: { in: seasonYears },
      },
    },
    select: {
      fullName: true,
      jerseyNumber: true,
      guardianEmail: true,
      guardianPhone: true,
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

  const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]));

  return candidates.map((candidate) => {
    const cycle = cycleById.get(candidate.ballotCycleId);
    if (!cycle) {
      throw new Error(`Missing cycle for candidate ${candidate.playerFullName}`);
    }

    const matched = matchTeamPlayerForCandidate(teamPlayers, {
      organizationId: cycle.organizationId,
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
      playerFullName: candidate.playerFullName,
      team: candidate.team,
      jerseyNumber: candidate.jerseyNumber,
    });

    const contactEmail = pickContactEmail(matched);

    return {
      organizationId: cycle.organizationId,
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
      cycleName: cycleDisplayName(cycle),
      rosterSlot: rosterSlotLabel(
        cycle.organizationId,
        cycle.title,
        candidate.finalRosterOverride === "SECOND_TEAM" ? "SECOND_TEAM" : "SELECTED",
      ),
      playerFullName: candidate.playerFullName,
      team: candidate.team,
      jerseyNumber: candidate.jerseyNumber,
      guardianEmail: matched?.guardianEmail?.trim() || "",
      guardianPhone: matched?.guardianPhone?.trim() || "",
      playerContactPhone: matched?.contactPhone?.trim() || "",
      contactEmail,
      emailMatchStatus: contactEmail ? "matched" : "not_found",
    };
  });
}

export function rosterContactRowsToCsv(rows: RosterContactRow[]) {
  const header = [
    "Organization",
    "Season Year",
    "Age Group",
    "Cycle",
    "Roster Slot",
    "Player Full Name",
    "Team",
    "Jersey Number",
    "Contact Email",
    "Guardian Email",
    "Guardian Phone",
    "Player Contact Phone",
    "Email Match Status",
  ];

  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;

  const body = rows.map((row) =>
    [
      row.organizationId,
      String(row.seasonYear),
      row.ageGroup,
      row.cycleName,
      row.rosterSlot,
      row.playerFullName,
      row.team,
      row.jerseyNumber,
      row.contactEmail,
      row.guardianEmail,
      row.guardianPhone,
      row.playerContactPhone,
      row.emailMatchStatus,
    ]
      .map((cell) => escape(cell))
      .join(","),
  );

  return [header.map((cell) => escape(cell)).join(","), ...body].join("\n");
}
