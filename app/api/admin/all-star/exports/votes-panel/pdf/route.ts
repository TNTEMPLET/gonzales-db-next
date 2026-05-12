import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import {
  buildAllStarExportFilename,
  getAllStarCycleDisplayName,
} from "@/lib/allStar/exportFormat";
import { parseAllStarPhase } from "@/lib/allStar/phase";
import {
  buildNameOnlyVotePdfRows,
  computeVoteSummaryRows,
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

  const { rows, cycle } = computed;
  const orgLabel = formatOrganizationIdDisplay(cycle.organizationId);
  const cycleName = getAllStarCycleDisplayName(cycle);
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
    autoTable(doc, {
      startY: 78,
      head: [head],
      body: rows.map((row, index) => [
        String(index + 1),
        row.playerFullName,
        row.team,
        String(row.voteCount),
        row.averageRating.toFixed(2),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [45, 45, 55] },
    });
  } else {
    const nameRows = buildNameOnlyVotePdfRows(rows);
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
