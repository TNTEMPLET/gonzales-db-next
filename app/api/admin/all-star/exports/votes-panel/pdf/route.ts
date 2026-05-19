import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import {
  buildAllStarExportFilename,
} from "@/lib/allStar/exportFormat";
import {
  formatAllStarCyclePipeListLabelFromOrgMeta,
  getRunoffExportTeamColorWord,
  getRunoffVotePanelSplitLabels,
} from "@/lib/allStar/cycleUiLabels";
import { parseAllStarPhase } from "@/lib/allStar/phase";
import {
  buildNameOnlyVotePdfRows,
  computeVoteSummaryRows,
  isAllStarRunoffTwoTeamBallot,
  parseVoteExportTopCount,
  parseVotePanelPdfTeamParam,
  splitVoteSummaryRowsForRunoff,
} from "@/lib/allStar/voteSummary";
import prisma from "@/lib/prisma";
import { formatOrganizationIdDisplay } from "@/lib/siteConfig";

/**
 * `layout=name` — name-only standings without ranks.
 * `layout=full` — full standings: Rank, Player, Votes, Avg Rating (same sort as Votes Panel).
 */
export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const cycleId = request.nextUrl.searchParams.get("cycleId")?.trim();
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const layoutRaw = request.nextUrl.searchParams.get("layout")?.trim().toLowerCase();
  const layout = layoutRaw === "name" || layoutRaw === "full" ? layoutRaw : null;
  if (!layout) {
    return NextResponse.json(
      { error: "layout is required: name | full" },
      { status: 400 },
    );
  }

  const phase = parseAllStarPhase(request.nextUrl.searchParams.get("phase"));
  const computed = await computeVoteSummaryRows(prisma, cycleId, phase ?? undefined);
  if (!computed) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const topCount = parseVoteExportTopCount(request.nextUrl.searchParams.get("topCount"));
  const { rows, cycle } = computed;
  const orgLabel = formatOrganizationIdDisplay(cycle.organizationId);
  const orgId = cycle.organizationId === "ascension" ? "ascension" : "gonzales";
  const isRunoffSplit = isAllStarRunoffTwoTeamBallot(cycle);
  const exportRows = isRunoffSplit
    ? rows
    : splitVoteSummaryRowsForRunoff(rows, topCount).firstTeam;
  const cycleName = formatAllStarCyclePipeListLabelFromOrgMeta(cycle);
  const nameOnlyTeamParam = parseVotePanelPdfTeamParam(request.nextUrl.searchParams.get("team"));
  const nameOnlyTeamColorWord =
    layout === "name" && isRunoffSplit && nameOnlyTeamParam
      ? getRunoffExportTeamColorWord(orgId, nameOnlyTeamParam, cycle.title)
      : null;
  const nameOnlyCycleTitle = nameOnlyTeamColorWord
    ? formatAllStarCyclePipeListLabelFromOrgMeta(cycle, { teamColorWord: nameOnlyTeamColorWord })
    : cycleName;
  const title =
    layout === "name"
      ? nameOnlyCycleTitle
      : `Vote standings — ${cycleName}`;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFontSize(14);
  doc.text(title, 40, 44);
  doc.setFontSize(10);
  doc.text(`${orgLabel} · Generated: ${new Date().toLocaleString()}`, 40, 62);

  let nameOnlyExportFilename: string | null = null;

  if (layout === "full") {
    const head = ["Rank", "Player", "Team", "Votes", "Avg Rating"];

    if (isRunoffSplit) {
      const { firstTeam, secondTeam } = splitVoteSummaryRowsForRunoff(
        exportRows,
        cycle.runoffFirstTeamSize!,
      );
      const { primaryHeading, secondaryHeading } = getRunoffVotePanelSplitLabels({
        organizationId: orgId,
        title: cycle.title,
        runoffIsFinalVote: cycle.runoffIsFinalVote,
        runoffTeamTarget: cycle.runoffTeamTarget,
        runoffPlayersNeeded: cycle.runoffPlayersNeeded,
      });
      let startY = 78;
      doc.setFontSize(11);
      doc.text(primaryHeading, 40, startY);
      startY += 14;
      autoTable(doc, {
        startY,
        head: [head],
        body: firstTeam.map((row, index) => [
          String(index + 1),
          row.playerFullName,
          row.team,
          String(row.voteCount),
          row.averageRating.toFixed(2),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [45, 45, 55] },
      });
      const afterFirst = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
      startY = afterFirst + 20;
      doc.setFontSize(11);
      doc.text(secondaryHeading, 40, startY);
      startY += 14;
      autoTable(doc, {
        startY,
        head: [head],
        body: secondTeam.map((row, index) => [
          String(firstTeam.length + index + 1),
          row.playerFullName,
          row.team,
          String(row.voteCount),
          row.averageRating.toFixed(2),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [45, 45, 55] },
      });
    } else {
      autoTable(doc, {
        startY: 78,
        head: [head],
        body: exportRows.map((row, index) => [
          String(index + 1),
          row.playerFullName,
          row.team,
          String(row.voteCount),
          row.averageRating.toFixed(2),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [45, 45, 55] },
      });
    }
  } else {
    let nameExportRows = exportRows;
    let nameRowCount = exportRows.length;
    let teamHeading: string | null = null;

    if (isRunoffSplit && cycle.runoffFirstTeamSize) {
      const team = parseVotePanelPdfTeamParam(request.nextUrl.searchParams.get("team"));
      if (!team) {
        return NextResponse.json(
          { error: "team is required for two-team ballots: primary | secondary" },
          { status: 400 },
        );
      }
      const split = splitVoteSummaryRowsForRunoff(rows, cycle.runoffFirstTeamSize);
      const { primaryHeading, secondaryHeading } = getRunoffVotePanelSplitLabels({
        organizationId: orgId,
        title: cycle.title,
        runoffIsFinalVote: cycle.runoffIsFinalVote,
        runoffTeamTarget: cycle.runoffTeamTarget,
        runoffPlayersNeeded: cycle.runoffPlayersNeeded,
      });
      nameExportRows = team === "primary" ? split.firstTeam : split.secondTeam;
      nameRowCount = nameExportRows.length;
      teamHeading = team === "primary" ? primaryHeading : secondaryHeading;
      if (nameOnlyTeamColorWord) {
        nameOnlyExportFilename = buildAllStarExportFilename(
          formatAllStarCyclePipeListLabelFromOrgMeta(cycle, {
            omitStatus: true,
            teamColorWord: nameOnlyTeamColorWord,
          }),
        );
      }
    }

    const nameRows = buildNameOnlyVotePdfRows(nameExportRows, nameRowCount);
    let startY = 78;
    if (teamHeading) {
      doc.setFontSize(11);
      doc.text(teamHeading, 40, startY);
      startY += 16;
    }
    autoTable(doc, {
      startY,
      head: [["Player"]],
      body: nameRows.map((row) => [row.displayLine]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [45, 45, 55] },
    });
  }

  const pdfBuffer = doc.output("arraybuffer");
  const baseName =
    nameOnlyExportFilename ??
    buildAllStarExportFilename(cycleName, layout === "name" ? "names" : "standings");

  return new NextResponse(Buffer.from(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
    },
  });
}
