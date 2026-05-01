import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";
import { isMasterDeployment } from "@/lib/siteConfig";

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  if (!isMasterDeployment()) {
    return NextResponse.json({ error: "Master deployment only" }, { status: 403 });
  }

  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    include: {
      candidates: true,
      voteSubmissions: {
        include: { voteItems: true, coachUser: { select: { email: true, firstName: true, lastName: true, name: true } } },
      },
    },
  });

  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const header = [
    "Organization",
    "Season Year",
    "Age Group",
    "Player Full Name",
    "Team",
    "Jersey Number",
    "Average Rating",
    "Total Ratings",
  ];
  if (cycle.hasShowcase) {
    header.splice(6, 0, "Showcase Bib #");
  }

  const ratingMap = new Map<string, number[]>();
  for (const submission of cycle.voteSubmissions) {
    for (const item of submission.voteItems) {
      const bucket = ratingMap.get(item.candidateId) || [];
      bucket.push(item.rating);
      ratingMap.set(item.candidateId, bucket);
    }
  }

  const rows = cycle.candidates.map((candidate) => {
    const ratings = ratingMap.get(candidate.id) || [];
    const avg = ratings.length
      ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(2)
      : "0.00";
    const row = [
      cycle.organizationId,
      String(cycle.seasonYear),
      cycle.ageGroup,
      candidate.playerFullName,
      candidate.team,
      candidate.jerseyNumber,
      avg,
      String(ratings.length),
    ];
    if (cycle.hasShowcase) {
      row.splice(6, 0, candidate.showcaseBibNumber || "");
    }
    return row;
  });

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(cell)).join(","))
    .join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="all-star-${cycle.organizationId}-${cycle.seasonYear}-${cycle.ageGroup}.csv"`,
    },
  });
}
