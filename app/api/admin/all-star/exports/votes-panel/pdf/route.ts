import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import {
  buildAllStarExportFilename,
} from "@/lib/allStar/exportFormat";
import {
  formatAllStarCyclePipeListLabelFromOrgMeta,
  getRunoffVotePanelPrimaryTeamHeading,
  getRunoffVotePanelSecondaryTeamHeading,
} from "@/lib/allStar/cycleUiLabels";
import { parseAllStarPhase } from "@/lib/allStar/phase";
import {
  buildNameOnlyVotePdfRows,
  computeVoteSummaryRows,
  parseVoteExportTopCount,
  selectVoteSummaryTopVoteGetterPool,
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
  const exportRows = selectVoteSummaryTopVoteGetterPool(rows, topCount);
  const orgLabel = formatOrganizationIdDisplay(cycle.organizationId);
  const orgId = cycle.organizationId === "ascension" ? "ascension" : "gonzales";
  const cycleName = formatAllStarCyclePipeListLabelFromOrgMeta(cycle);
  const title =
    layout === "name"
      ? cycleName
      : `Vote standings — ${cycleName}`;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFontSize(14);
  doc.text(title, 40, 44);
  doc.setFontSize(10);
  doc.text(`${orgLabel} · Generated: ${new Date().toLocaleString()}`, 40, 62);

  if (layout === "full") {
    const head = ["Rank", "Player", "Team", "Votes", "Avg Rating"];
    const isRunoffSplit =
      cycle.runoffFirstTeamSize != null &&
      cycle.runoffFirstTeamSize > 0 &&
      cycle.runoffPoolSize != null;

    if (isRunoffSplit) {
      const { firstTeam, secondTeam } = splitVoteSummaryRowsForRunoff(
        exportRows,
        cycle.runoffFirstTeamSize!,
      );
      const primaryHeading = getRunoffVotePanelPrimaryTeamHeading(orgId, cycle.title);
      const secondaryHeading = getRunoffVotePanelSecondaryTeamHeading(orgId);
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
    const nameRows = buildNameOnlyVotePdfRows(rows, topCount);
    autoTable(doc, {
      startY: 78,
      head: [["Player"]],
      body: nameRows.map((row) => [row.displayLine]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [45, 45, 55] },
    });
  }

  const pdfBuffer = doc.output("arraybuffer");
  const suffix = layout === "name" ? "names" : "standings";
  const baseName = buildAllStarExportFilename(cycleName, suffix);

  return new NextResponse(Buffer.from(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
    },
  });
}
