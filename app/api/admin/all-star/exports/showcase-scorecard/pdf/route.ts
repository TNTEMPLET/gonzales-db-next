import { NextRequest, NextResponse } from "next/server";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import {
  buildAllStarExportFilename,
  getAllStarCycleDisplayName,
} from "@/lib/allStar/exportFormat";
import {
  computeVoteSummaryRows,
  parseVoteExportTopCount,
  selectVoteSummaryTopVoteGetterPool,
} from "@/lib/allStar/voteSummary";
import prisma from "@/lib/prisma";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fitTextToWidth(value: string, maxWidth: number, font: PDFFont, fontSize: number) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (font.widthOfTextAtSize(trimmed, fontSize) <= maxWidth) return trimmed;
  const ellipsis = "…";
  const ellipsisWidth = font.widthOfTextAtSize(ellipsis, fontSize);
  let end = trimmed.length;
  while (end > 1) {
    const next = `${trimmed.slice(0, end).trimEnd()}${ellipsis}`;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth - ellipsisWidth * 0.05) {
      return next;
    }
    end -= 1;
  }
  return ellipsis;
}

function getCycleTierLabel(title: string | null) {
  const normalizedTitle = (title || "").trim().toUpperCase();
  if (normalizedTitle === "11U DYB") return "SECOND_TEAM";
  return (title || "").toLowerCase().includes("second team")
    ? "SECOND_TEAM"
    : "FIRST_TEAM";
}

function getCycleName(cycle: { title: string | null; seasonYear: number; ageGroup: string }) {
  return getAllStarCycleDisplayName(cycle);
}

function getScorecardPalette(organizationId: string, title: string | null) {
  const tier = getCycleTierLabel(title);
  if (organizationId === "ascension") {
    if (tier === "SECOND_TEAM") {
      // RED team
      return {
        headerFill: rgb(0.47, 0.12, 0.14),
        headerBorder: rgb(0.58, 0.2, 0.23),
        headerText: rgb(0.95, 0.86, 0.87),
      };
    }
    // NAVY team
    return {
      headerFill: rgb(0.11, 0.19, 0.35),
      headerBorder: rgb(0.2, 0.3, 0.5),
      headerText: rgb(0.88, 0.91, 0.98),
    };
  }
  if (tier === "SECOND_TEAM") {
    // GOLD team
    return {
      headerFill: rgb(0.72, 0.56, 0.16),
      headerBorder: rgb(0.64, 0.49, 0.12),
      headerText: rgb(0.17, 0.12, 0.04),
    };
  }
  // PURPLE team
  return {
    headerFill: rgb(0.28, 0.16, 0.5),
    headerBorder: rgb(0.36, 0.24, 0.62),
    headerText: rgb(0.93, 0.88, 0.98),
  };
}

function drawHeader(
  page: PDFPage,
  font: PDFFont,
  cycleLabel: string,
  pageNumber: number,
  generatedAtLabel: string,
) {
  const { width, height } = page.getSize();
  page.drawText("Showcase Score Card", {
    x: 36,
    y: height - 34,
    size: 14,
    font,
    color: rgb(0.12, 0.12, 0.14),
  });
  page.drawText(cycleLabel, {
    x: 36,
    y: height - 50,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.24),
  });
  page.drawText(`Generated: ${generatedAtLabel}`, {
    x: 36,
    y: height - 64,
    size: 9,
    font,
    color: rgb(0.28, 0.28, 0.32),
  });
  page.drawText(`Page ${pageNumber}`, {
    x: width - 76,
    y: height - 34,
    size: 9,
    font,
    color: rgb(0.28, 0.28, 0.32),
  });
  page.drawText("For coach reference only — not submitted in system.", {
    x: 36,
    y: 18,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.4),
  });
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const cycleId = request.nextUrl.searchParams.get("cycleId")?.trim();
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    include: {
      candidates: {
        orderBy: [{ showcaseBibNumber: "asc" }, { playerFullName: "asc" }],
      },
    },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  const topCount = parseVoteExportTopCount(request.nextUrl.searchParams.get("topCount"));
  const computed = await computeVoteSummaryRows(prisma, cycleId);
  const exportCandidateIds = new Set(
    computed
      ? selectVoteSummaryTopVoteGetterPool(computed.rows, topCount).map((row) => row.candidateId)
      : [],
  );

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();
  const pageWidth = 792;
  const pageHeight = 612;
  const left = 28;
  const right = 28;
  const tableWidth = pageWidth - left - right;
  const tableTop = pageHeight - 92;
  const tableBottom = 42;
  const rowHeight = 24;
  const maxRowsPerPage = Math.max(1, Math.floor((tableTop - tableBottom) / rowHeight) - 1);
  const candidates = cycle.candidates.filter((candidate) => exportCandidateIds.has(candidate.id));
  const rowFontSize = 9;
  const headerFontSize = 8.5;
  const measureWidth = (text: string, size: number) => font.widthOfTextAtSize(text, size) + 10;
  const desiredBib = clamp(
    Math.max(
      measureWidth("Bib", headerFontSize),
      ...candidates.map((c) => measureWidth(c.showcaseBibNumber || "", rowFontSize)),
    ),
    42,
    74,
  );
  const desiredJersey = clamp(
    Math.max(
      measureWidth("Jersey", headerFontSize),
      ...candidates.map((c) => measureWidth(c.jerseyNumber || "", rowFontSize)),
    ),
    48,
    74,
  );
  const desiredPlayer = clamp(
    Math.max(
      measureWidth("Player", headerFontSize),
      ...candidates.map((c) => measureWidth(c.playerFullName || "", rowFontSize)),
    ),
    140,
    260,
  );
  const desiredTeam = clamp(
    Math.max(
      measureWidth("Team", headerFontSize),
      ...candidates.map((c) => measureWidth(c.team || "", rowFontSize)),
    ),
    120,
    240,
  );
  const fixedRatingWidth = 42 * 3;
  const notesMinWidth = 180;
  let bibWidth = desiredBib;
  let jerseyWidth = desiredJersey;
  let playerWidth = desiredPlayer;
  let teamWidth = desiredTeam;
  let totalUsed = bibWidth + playerWidth + teamWidth + jerseyWidth + fixedRatingWidth + notesMinWidth;
  if (totalUsed > tableWidth) {
    const overflow = totalUsed - tableWidth;
    const playerReduce = Math.min(overflow * 0.65, Math.max(0, playerWidth - 130));
    playerWidth -= playerReduce;
    const remaining = overflow - playerReduce;
    const teamReduce = Math.min(remaining, Math.max(0, teamWidth - 110));
    teamWidth -= teamReduce;
    totalUsed = bibWidth + playerWidth + teamWidth + jerseyWidth + fixedRatingWidth + notesMinWidth;
    if (totalUsed > tableWidth) {
      const tightOverflow = totalUsed - tableWidth;
      const bibReduce = Math.min(tightOverflow * 0.5, Math.max(0, bibWidth - 40));
      bibWidth -= bibReduce;
      const jerseyReduce = Math.min(tightOverflow - bibReduce, Math.max(0, jerseyWidth - 44));
      jerseyWidth -= jerseyReduce;
    }
  }
  const notesWidth = Math.max(
    notesMinWidth,
    tableWidth - (bibWidth + playerWidth + teamWidth + jerseyWidth + fixedRatingWidth),
  );
  const columns = [
    { key: "bib", label: "Bib", width: bibWidth },
    { key: "player", label: "Player", width: playerWidth },
    { key: "team", label: "Team", width: teamWidth },
    { key: "jersey", label: "Jersey", width: jerseyWidth },
    { key: "throw", label: "Throw", width: 42 },
    { key: "hit", label: "Hit", width: 42 },
    { key: "run", label: "Run", width: 42 },
    { key: "notes", label: "Notes", width: notesWidth },
  ];
  const pageChunks: Array<typeof candidates> = [];
  for (let i = 0; i < candidates.length; i += maxRowsPerPage) {
    pageChunks.push(candidates.slice(i, i + maxRowsPerPage));
  }
  if (pageChunks.length === 0) pageChunks.push([]);

  const generatedAt = new Date().toLocaleString();
  const cycleName = getCycleName(cycle);
  const cycleLabel = cycleName;
  const palette = getScorecardPalette(cycle.organizationId, cycle.title);

  pageChunks.forEach((chunk, pageIdx) => {
    const page = pdf.addPage([pageWidth, pageHeight]);
    drawHeader(page, font, cycleLabel, pageIdx + 1, generatedAt);

    const headerY = tableTop;
    const rowStartY = headerY - rowHeight;
    page.drawRectangle({
      x: left,
      y: headerY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: palette.headerFill,
    });

    const dataBottomY = rowStartY - chunk.length * rowHeight;
    let cursorX = left;
    columns.forEach((col) => {
      page.drawLine({
        start: { x: cursorX, y: dataBottomY },
        end: { x: cursorX, y: headerY },
        thickness: 0.8,
        color: palette.headerBorder,
      });
      page.drawText(col.label, {
        x:
          cursorX +
          Math.max(3, (col.width - font.widthOfTextAtSize(col.label, headerFontSize)) / 2),
        y: headerY - 16,
        size: headerFontSize,
        font,
        color: palette.headerText,
      });
      cursorX += col.width;
    });
    page.drawLine({
      start: { x: left + tableWidth, y: dataBottomY },
      end: { x: left + tableWidth, y: headerY },
      thickness: 0.8,
      color: palette.headerBorder,
    });
    page.drawLine({
      start: { x: left, y: headerY },
      end: { x: left + tableWidth, y: headerY },
      thickness: 0.8,
      color: palette.headerBorder,
    });

    chunk.forEach((candidate, rowIdx) => {
      const yTop = rowStartY - rowIdx * rowHeight;
      const yBottom = yTop - rowHeight;
      page.drawLine({
        start: { x: left, y: yBottom },
        end: { x: left + tableWidth, y: yBottom },
        thickness: 0.7,
        color: rgb(0.3, 0.3, 0.34),
      });

      let x = left;
      const bibText = fitTextToWidth(candidate.showcaseBibNumber || "", columns[0].width - 8, font, rowFontSize);
      const playerText = fitTextToWidth(candidate.playerFullName, columns[1].width - 8, font, rowFontSize);
      const teamText = fitTextToWidth(candidate.team, columns[2].width - 8, font, rowFontSize);
      const jerseyText = fitTextToWidth(candidate.jerseyNumber, columns[3].width - 8, font, rowFontSize);
      page.drawText(bibText, { x: x + 4, y: yBottom + 8, size: rowFontSize, font, color: rgb(0.08, 0.08, 0.1) });
      x += columns[0].width;
      page.drawText(playerText, { x: x + 4, y: yBottom + 8, size: rowFontSize, font, color: rgb(0.08, 0.08, 0.1) });
      x += columns[1].width;
      page.drawText(teamText, { x: x + 4, y: yBottom + 8, size: rowFontSize, font, color: rgb(0.08, 0.08, 0.1) });
      x += columns[2].width;
      const jerseyTextWidth = font.widthOfTextAtSize(jerseyText, rowFontSize);
      const centeredJerseyX = x + Math.max(4, (columns[3].width - jerseyTextWidth) / 2);
      page.drawText(jerseyText, {
        x: centeredJerseyX,
        y: yBottom + 8,
        size: rowFontSize,
        font,
        color: rgb(0.08, 0.08, 0.1),
      });

      const fieldRowTag = `p${pageIdx + 1}_r${rowIdx + 1}_${candidate.id}`;
      const throwField = form.createTextField(`showcase_throw_${fieldRowTag}`);
      throwField.addToPage(page, {
        x: left + columns[0].width + columns[1].width + columns[2].width + columns[3].width + 3,
        y: yBottom + 4,
        width: columns[4].width - 6,
        height: rowHeight - 8,
        borderWidth: 0.9,
      });
      throwField.setFontSize(9);

      const hitField = form.createTextField(`showcase_hit_${fieldRowTag}`);
      hitField.addToPage(page, {
        x:
          left +
          columns[0].width +
          columns[1].width +
          columns[2].width +
          columns[3].width +
          columns[4].width +
          3,
        y: yBottom + 4,
        width: columns[5].width - 6,
        height: rowHeight - 8,
        borderWidth: 0.9,
      });
      hitField.setFontSize(9);

      const runField = form.createTextField(`showcase_run_${fieldRowTag}`);
      runField.addToPage(page, {
        x:
          left +
          columns[0].width +
          columns[1].width +
          columns[2].width +
          columns[3].width +
          columns[4].width +
          columns[5].width +
          3,
        y: yBottom + 4,
        width: columns[6].width - 6,
        height: rowHeight - 8,
        borderWidth: 0.9,
      });
      runField.setFontSize(9);

      const notesField = form.createTextField(`showcase_notes_${fieldRowTag}`);
      notesField.enableMultiline();
      notesField.addToPage(page, {
        x:
          left +
          columns[0].width +
          columns[1].width +
          columns[2].width +
          columns[3].width +
          columns[4].width +
          columns[5].width +
          columns[6].width +
          3,
        y: yBottom + 3,
        width: columns[7].width - 6,
        height: rowHeight - 6,
        borderWidth: 0.9,
      });
      notesField.setFontSize(8);
    });
    page.drawLine({
      start: { x: left, y: dataBottomY },
      end: { x: left + tableWidth, y: dataBottomY },
      thickness: 0.8,
      color: rgb(0.3, 0.3, 0.34),
    });
  });

  const bytes = await pdf.save();
  const baseName = buildAllStarExportFilename(cycleName, "showcase-score-card");
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
    },
  });
}
