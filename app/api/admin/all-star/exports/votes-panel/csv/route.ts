import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import { parseAllStarPhase } from "@/lib/allStar/phase";
import { computeVoteSummaryRows } from "@/lib/allStar/voteSummary";
import prisma from "@/lib/prisma";

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function filenameSlug(parts: string[]) {
  return parts
    .join("-")
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getCycleName(cycle: { title: string | null; seasonYear: number; ageGroup: string }) {
  const title = cycle.title?.trim();
  if (title) return title;
  return `${cycle.seasonYear} ${cycle.ageGroup}`;
}

/** CSV matches Votes Panel: sort order and columns (rank, player, team, jersey, optional bib, votes, avg). */
export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const cycleId = request.nextUrl.searchParams.get("cycleId")?.trim();
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const phase = parseAllStarPhase(request.nextUrl.searchParams.get("phase"));
  const computed = await computeVoteSummaryRows(prisma, cycleId, phase ?? undefined);
  if (!computed) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const { rows, cycle } = computed;
  const header = ["Rank", "Player Full Name", "Team", "Jersey Number"];
  if (cycle.hasShowcase) header.push("Showcase Bib #");
  header.push("Votes", "Avg Rating");

  const body = rows.map((row, index) => {
    const base = [
      String(index + 1),
      row.playerFullName,
      row.team,
      row.jerseyNumber,
    ];
    if (cycle.hasShowcase) {
      base.push(row.showcaseBibNumber || "");
    }
    base.push(String(row.voteCount), row.averageRating.toFixed(2));
    return base;
  });

  const csv = [header, ...body].map((line) => line.map((cell) => csvEscape(cell)).join(",")).join("\n");
  const cycleName = getCycleName(cycle);

  const baseName = filenameSlug([
    "votes-panel",
    cycle.organizationId,
    String(cycle.seasonYear),
    cycleName,
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.csv"`,
    },
  });
}
