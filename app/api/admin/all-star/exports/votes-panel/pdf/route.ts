import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import {
  buildNameOnlyVotePdfRows,
  computeVoteSummaryRows,
} from "@/lib/allStar/voteSummary";
import prisma from "@/lib/prisma";
import { formatOrganizationIdDisplay } from "@/lib/siteConfig";

function filenameSlug(parts: string[]) {
  return parts
    .join("-")
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * `layout=name` — ranks 1–11 + rank 12 tier (names only; avg in name when tied at 12).
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

  const computed = await computeVoteSummaryRows(prisma, cycleId);
  if (!computed) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const { rows, cycle } = computed;
  const orgLabel = formatOrganizationIdDisplay(cycle.organizationId);
  const title =
    layout === "name"
      ? `Vote standings (name view) — ${orgLabel} ${cycle.ageGroup} (${cycle.seasonYear})`
      : `Vote standings (full view) — ${orgLabel} ${cycle.ageGroup} (${cycle.seasonYear})`;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFontSize(14);
  doc.text(title, 40, 44);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 62);

  if (layout === "full") {
    autoTable(doc, {
      startY: 78,
      head: [["Rank", "Player", "Votes", "Avg Rating"]],
      body: rows.map((row, index) => [
        String(index + 1),
        row.playerFullName,
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
      head: [["Rank", "Player"]],
      body: nameRows.map((r) => [r.rank, r.displayLine]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [45, 45, 55] },
      columnStyles: {
        0: { cellWidth: 44 },
        1: { cellWidth: "auto" },
      },
    });
  }

  const pdfBuffer = doc.output("arraybuffer");
  const suffix = layout === "name" ? "name" : "full";
  const baseName = filenameSlug([
    "votes-panel",
    suffix,
    cycle.organizationId,
    String(cycle.seasonYear),
    cycle.ageGroup,
  ]);

  return new NextResponse(Buffer.from(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
    },
  });
}
