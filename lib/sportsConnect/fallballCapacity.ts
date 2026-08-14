import "server-only";

import prisma from "@/lib/prisma";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { getDriveAccessToken } from "@/lib/google/driveServiceAccount";
import * as XLSX from "xlsx";

const FALLBALL_ORG = "fallball" as const;

export type FallBallDivisionCapacity = {
  divisionName: string;
  enrolledPlayers: number;
  recommendedRosterSize: number;
  estimatedTeams: number;
  matchedCoaches: number;
  status: "DEFICIT" | "NEAR_CAPACITY" | "IDEAL" | "SURPLUS";
};

export type FallBallPlayerDataSource =
  | "team_rosters"
  | "sports_connect_sync"
  | "manual_fallback";

export type FallBallCapacityReport = {
  organizationId: "fallball";
  seasonYear: number;
  seasonLabel: string;
  generatedAt: string;
  teamsFormed: boolean;
  totalPlayers: number;
  totalCoaches: number;
  totalEstimatedTeams: number;
  divisions: FallBallDivisionCapacity[];
  playerDataSource: FallBallPlayerDataSource;
  lastPlayerRegSyncAt: string | null;
  lastPlayerRegSyncFileName: string | null;
};

const DEFAULT_DIVISION_PLAYER_COUNTS: Record<string, number> = {
  "Tee Ball, 3-4 year-olds": 124,
  "Tee Ball, 5 year-olds": 109,
  "Modified Tee Ball, 6 year-olds": 138,
  "Coaches' Pitch 7 year-olds": 106,
  "Coaches' Pitch 8 year-olds": 65,
  "9 year-old": 87,
  "10 year-old": 47,
  "11-12 year-olds": 97,
  "13-15 year-olds": 41,
  "15-17 year-olds": 17,
};

const STANDARD_DIVISIONS = [
  "Tee Ball, 3-4 year-olds",
  "Tee Ball, 5 year-olds",
  "Modified Tee Ball, 6 year-olds",
  "Coaches' Pitch 7 year-olds",
  "Coaches' Pitch 8 year-olds",
  "9 year-old",
  "10 year-old",
  "11-12 year-olds",
  "13-15 year-olds",
  "15-17 year-olds",
];

export async function getFallBallCapacityReport(): Promise<FallBallCapacityReport> {
  const organizationId = FALLBALL_ORG;
  const season = getSeasonConfigForOrg(organizationId);

  // 1. Check for formed teams first
  const teams = await prisma.team.findMany({
    where: { organizationId, seasonYear: season.year },
    select: {
      ageGroup: true,
      _count: { select: { players: true, coachAssignments: true } },
    },
  });

  const teamsFormed = teams.length > 0;

  // 2. Fetch latest PLAYER_REG import run
  const lastPlayerRun = await prisma.sportsConnectImportRun.findFirst({
    where: { organizationId, reportKind: "PLAYER_REG", status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, sourceFileName: true, driveFileId: true },
  });

  const divisionPlayerCounts: Record<string, number> = { ...DEFAULT_DIVISION_PLAYER_COUNTS };

  // Parse Google Drive file if available
  if (lastPlayerRun?.driveFileId) {
    try {
      const token = await getDriveAccessToken();
      if (token) {
        const downloadRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${lastPlayerRun.driveFileId}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (downloadRes.ok) {
          const buffer = Buffer.from(await downloadRes.arrayBuffer());
          const workbook = XLSX.read(buffer, { type: "buffer" });
          const sheetName = workbook.SheetNames[0];
          const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

          if (rawRows.length > 0) {
            const dynamicCounts: Record<string, number> = {};
            for (const r of rawRows) {
              const div = String(r["Division Name"] || r["Division"] || "").trim();
              if (div) dynamicCounts[div] = (dynamicCounts[div] || 0) + 1;
            }
            if (Object.keys(dynamicCounts).length > 0) {
              Object.assign(divisionPlayerCounts, dynamicCounts);
            }
          }
        }
      }
    } catch (err) {
      console.warn("[fallballCapacity] Falling back to default division counts:", err);
    }
  }

  // If teams are formed, override player counts with team player counts
  if (teamsFormed) {
    const teamPlayerCounts: Record<string, number> = {};
    for (const t of teams) {
      teamPlayerCounts[t.ageGroup] = (teamPlayerCounts[t.ageGroup] || 0) + t._count.players;
    }
    Object.assign(divisionPlayerCounts, teamPlayerCounts);
  }

  // 3. Query converted coaches
  const convertedCoaches = await prisma.coachingInterestSubmission.findMany({
    where: { organizationId, status: "CONVERTED" },
    select: { adminNotes: true, interestedDivision: true },
  });

  const divisionCoachCounts: Record<string, number> = {};
  for (const c of convertedCoaches) {
    const notes = c.adminNotes || "";
    const divMatch = notes.match(/Division:\s*([^,]+)/);
    const divName = divMatch ? divMatch[1].trim() : c.interestedDivision;

    if (divName.includes("Modified")) {
      divisionCoachCounts["Modified Tee Ball, 6 year-olds"] = (divisionCoachCounts["Modified Tee Ball, 6 year-olds"] || 0) + 1;
    } else if (divName.includes("7 year")) {
      divisionCoachCounts["Coaches' Pitch 7 year-olds"] = (divisionCoachCounts["Coaches' Pitch 7 year-olds"] || 0) + 1;
    } else if (divName.includes("8 year")) {
      divisionCoachCounts["Coaches' Pitch 8 year-olds"] = (divisionCoachCounts["Coaches' Pitch 8 year-olds"] || 0) + 1;
    } else if (divName.includes("9 year")) {
      divisionCoachCounts["9 year-old"] = (divisionCoachCounts["9 year-old"] || 0) + 1;
    } else if (divName.includes("10 year")) {
      divisionCoachCounts["10 year-old"] = (divisionCoachCounts["10 year-old"] || 0) + 1;
    } else if (divName.includes("11-12")) {
      divisionCoachCounts["11-12 year-olds"] = (divisionCoachCounts["11-12 year-olds"] || 0) + 1;
    } else if (divName.includes("13-15")) {
      divisionCoachCounts["13-15 year-olds"] = (divisionCoachCounts["13-15 year-olds"] || 0) + 1;
    } else if (divName.includes("15-17")) {
      divisionCoachCounts["15-17 year-olds"] = (divisionCoachCounts["15-17 year-olds"] || 0) + 1;
    } else if (divName.includes("Tee Ball")) {
      divisionCoachCounts["Tee Ball, 3-4 year-olds"] = (divisionCoachCounts["Tee Ball, 3-4 year-olds"] || 0) + 1;
    } else {
      divisionCoachCounts[divName] = (divisionCoachCounts[divName] || 0) + 1;
    }
  }

  let totalPlayers = 0;
  let totalEstimatedTeams = 0;

  const divisions: FallBallDivisionCapacity[] = STANDARD_DIVISIONS.map((divName) => {
    const players = divisionPlayerCounts[divName] || 0;
    const rosterSize = divName.includes("15-17") ? 10 : divName.includes("13-15") ? 11 : 12;
    const estTeams = Math.ceil(players / rosterSize);
    const coaches = divisionCoachCounts[divName] || 0;

    totalPlayers += players;
    totalEstimatedTeams += estTeams;

    let status: FallBallDivisionCapacity["status"] = "IDEAL";
    if (coaches === 0 || coaches < estTeams - 1) {
      status = "DEFICIT";
    } else if (coaches === estTeams - 1) {
      status = "NEAR_CAPACITY";
    } else if (coaches > estTeams + 2) {
      status = "SURPLUS";
    } else {
      status = "IDEAL";
    }

    return {
      divisionName: divName,
      enrolledPlayers: players,
      recommendedRosterSize: rosterSize,
      estimatedTeams: estTeams,
      matchedCoaches: coaches,
      status,
    };
  });

  return {
    organizationId,
    seasonYear: season.year,
    seasonLabel: season.label,
    generatedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    teamsFormed,
    totalPlayers,
    totalCoaches: convertedCoaches.length,
    totalEstimatedTeams,
    divisions,
    playerDataSource: teamsFormed ? "team_rosters" : lastPlayerRun ? "sports_connect_sync" : "manual_fallback",
    lastPlayerRegSyncAt: lastPlayerRun?.createdAt.toISOString() ?? null,
    lastPlayerRegSyncFileName: lastPlayerRun?.sourceFileName ?? null,
  };
}
