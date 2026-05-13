import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import {
  buildAllStarExportFilename,
  getAllStarCycleDisplayName,
} from "@/lib/allStar/exportFormat";
import { parseAllStarPhase } from "@/lib/allStar/phase";
import { computeVoteSummaryRows, splitVoteSummaryRowsForRunoff } from "@/lib/allStar/voteSummary";
import prisma from "@/lib/prisma";

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
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
  const isRunoffSplit =
    cycle.runoffFirstTeamSize != null &&
    cycle.runoffFirstTeamSize > 0 &&
    cycle.runoffPoolSize != null;

  function rowToCsvLine(row: (typeof rows)[0], rank: number) {
    const base = [
      String(rank),
      row.playerFullName,
      row.team,
      row.jerseyNumber,
    ];
    if (cycle.hasShowcase) {
      base.push(row.showcaseBibNumber || "");
    }
    base.push(String(row.voteCount), row.averageRating.toFixed(2));
    return base;
  }

  const header = ["Rank", "Player Full Name", "Team", "Jersey Number"];
  if (cycle.hasShowcase) header.push("Showcase Bib #");
  header.push("Votes", "Avg Rating");

  if (isRunoffSplit) {
    const { firstTeam, secondTeam } = splitVoteSummaryRowsForRunoff(
      rows,
      cycle.runoffFirstTeamSize!,
    );
    const splitHeader = ["Team tier", ...header];
    const splitBody = [
      ...firstTeam.map((row, index) => [
        csvEscape("First team"),
        ...rowToCsvLine(row, index + 1).map((cell) => csvEscape(cell)),
      ]),
      ...secondTeam.map((row, index) => [
        csvEscape("Second team"),
        ...rowToCsvLine(row, firstTeam.length + index + 1).map((cell) => csvEscape(cell)),
      ]),
    ].map((line) => line.join(","));
    const csv = [splitHeader.map((cell) => csvEscape(cell)).join(","), ...splitBody].join("\n");
    const cycleName = getAllStarCycleDisplayName(cycle);
    const baseName = buildAllStarExportFilename(cycleName, "standings");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseName}.csv"`,
      },
    });
  }

  const body = rows.map((row, index) => rowToCsvLine(row, index + 1));

  const csv = [header, ...body].map((line) => line.map((cell) => csvEscape(cell)).join(",")).join("\n");
  const cycleName = getAllStarCycleDisplayName(cycle);
  const baseName = buildAllStarExportFilename(cycleName, "standings");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.csv"`,
    },
  });
}
