import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/adminSession";
import { driveV3Request, getDriveAccessToken } from "@/lib/google/driveServiceAccount";
import XLSX from "xlsx";

export type FallBallDivisionCapacityData = {
  divisionName: string;
  enrolledPlayers: number;
  recommendedRosterSize: number;
  estimatedTeams: number;
  matchedCoaches: number;
  status: "SURPLUS" | "IDEAL" | "NEAR_CAPACITY" | "DEFICIT";
};

export type FallBallCapacityReportResponse = {
  organizationId: string;
  reportDate: string;
  totalPlayers: number;
  totalCoaches: number;
  totalEstimatedTeams: number;
  divisions: FallBallDivisionCapacityData[];
  sourceFile: string;
};

export async function getFallBallCapacityData(): Promise<FallBallCapacityReportResponse> {
  // 1. Fetch latest PLAYER_REG import run for fallball
  const latestRun = await prisma.sportsConnectImportRun.findFirst({
    where: { organizationId: "fallball", reportKind: "PLAYER_REG", status: "DONE" },
    orderBy: { createdAt: "desc" },
  });

  const divisionPlayerCounts: Record<string, number> = {
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

  let sourceFileName = latestRun?.sourceFileName || "Enrollment_Details.xlsx";

  // Try parsing directly from drive file if available
  if (latestRun?.driveFileId) {
    try {
      const token = await getDriveAccessToken();
      if (token) {
        const downloadRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${latestRun.driveFileId}?alt=media`,
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
      console.warn("[Capacity API] Falling back to default counts:", err);
    }
  }

  // 2. Fetch converted coaches for fallball
  const convertedCoaches = await prisma.coachingInterestSubmission.findMany({
    where: { organizationId: "fallball", status: "CONVERTED" },
  });

  const divisionCoachCounts: Record<string, number> = {};
  for (const c of convertedCoaches) {
    const notes = c.adminNotes || "";
    const divMatch = notes.match(/Division:\s*([^,]+)/);
    const divName = divMatch ? divMatch[1].trim() : c.interestedDivision;

    // Normalize keys
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

  const standardDivisions = [
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

  let totalPlayers = 0;
  let totalEstimatedTeams = 0;

  const divisions: FallBallDivisionCapacityData[] = standardDivisions.map((divName) => {
    const players = divisionPlayerCounts[divName] || 0;
    const rosterSize = divName.includes("15-17") ? 10 : divName.includes("13-15") ? 11 : 12;
    const estTeams = Math.ceil(players / rosterSize);
    const coaches = divisionCoachCounts[divName] || 0;

    totalPlayers += players;
    totalEstimatedTeams += estTeams;

    let status: FallBallDivisionCapacityData["status"] = "IDEAL";
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
    organizationId: "fallball",
    reportDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    totalPlayers,
    totalCoaches: convertedCoaches.length,
    totalEstimatedTeams,
    divisions,
    sourceFile: sourceFileName,
  };
}

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const report = await getFallBallCapacityData();
    return NextResponse.json(report);
  } catch (error) {
    console.error("[Capacity API Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
