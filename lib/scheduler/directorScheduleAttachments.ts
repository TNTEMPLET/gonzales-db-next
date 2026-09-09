import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { ResendAttachment } from "@/lib/communications/providers/resend";
import { formatNotifyClock } from "@/lib/scheduler/coachScheduleEmail";
import { groupDirectorGames, type DirectorScheduleGame } from "@/lib/scheduler/directorScheduleEmail";

const AP_RED: [number, number, number] = [204, 0, 0];
const HEADER_GRAY: [number, number, number] = [80, 80, 80];
const ROW_STRIPE: [number, number, number] = [245, 245, 245];

export function directorScheduleFileStem(seasonName: string, parkNames: string[]): string {
  const parkPart = parkNames.length === 1 ? parkNames[0] : "director-schedule";
  const stem = `${seasonName} ${parkPart}`.trim().replace(/[^a-zA-Z0-9]+/g, "-");
  return stem.replace(/^-+|-+$/g, "") || "director-schedule";
}

function lastTableY(doc: jsPDF, fallback: number): number {
  const table = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof table?.finalY === "number" ? table.finalY : fallback;
}

export function buildDirectorSchedulePdf(input: {
  seasonName: string;
  orgName?: string;
  gamesWindow?: string;
  games: DirectorScheduleGame[];
}): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const groups = groupDirectorGames(input.games);
  let y = margin;

  if (input.orgName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...HEADER_GRAY);
    doc.text(input.orgName.toUpperCase(), margin, y);
    y += 14;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(`${input.seasonName} director schedule`, margin, y);
  y += 16;

  if (input.gamesWindow) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...HEADER_GRAY);
    doc.text(`Games (${input.gamesWindow})`, margin, y);
    y += 18;
  }

  if (!groups.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("No placed games in the selected parks.", margin, y);
  }

  function writeParkHeading(parkName: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(parkName, margin, y);
    y += 8;
  }

  groups.forEach((park, parkIndex) => {
    if (parkIndex > 0) {
      doc.addPage();
      y = margin;
      if (input.orgName) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...HEADER_GRAY);
        doc.text(input.orgName.toUpperCase(), margin, y);
        y += 14;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text(`${input.seasonName} director schedule`, margin, y);
      y += 18;
    }
    writeParkHeading(park.parkName);

    for (const day of park.days) {
      if (y > doc.internal.pageSize.getHeight() - 140) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(day.dateLabel, margin, y + 12);
      autoTable(doc, {
        startY: y + 18,
        head: [["Field", "Division", "Start", "Home", "Away"]],
        body: day.rows.map((game) => [
          game.fieldName,
          game.division,
          formatNotifyClock(game.startTime),
          game.homeTeamName,
          game.awayTeamName,
        ]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 10, cellPadding: 5, valign: "top" },
        headStyles: { fillColor: AP_RED, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: ROW_STRIPE },
        columnStyles: {
          0: { cellWidth: 120 },
          1: { cellWidth: 90 },
          2: { cellWidth: 80 },
          3: { cellWidth: 180 },
        },
      });
      y = lastTableY(doc, y) + 16;
    }
  });

  const pageCount = doc.getNumberOfPages();
  const footer = `${input.seasonName} director schedule`;
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...HEADER_GRAY);
    doc.text(footer, margin, doc.internal.pageSize.getHeight() - 24);
    doc.text(String(page), pageWidth - margin, doc.internal.pageSize.getHeight() - 24, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export function buildDirectorScheduleAttachments(input: {
  seasonName: string;
  orgName?: string;
  gamesWindow?: string;
  games: DirectorScheduleGame[];
}): ResendAttachment[] {
  const parkNames = [...new Set(input.games.map((game) => game.parkName).filter(Boolean))];
  const stem = directorScheduleFileStem(input.seasonName, parkNames);
  const pdf = buildDirectorSchedulePdf(input);
  return [
    {
      filename: `${stem}.pdf`,
      content: pdf.toString("base64"),
      contentType: "application/pdf",
    },
  ];
}
