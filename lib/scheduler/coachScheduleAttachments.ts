import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { ResendAttachment } from "@/lib/communications/providers/resend";
import type { CoachNotifyGameLine, CoachNotifyPracticeLine } from "@/lib/scheduler/coachScheduleEmail";

const AP_RED: [number, number, number] = [204, 0, 0];
const HEADER_GRAY: [number, number, number] = [80, 80, 80];
const ROW_STRIPE: [number, number, number] = [245, 245, 245];

export function coachScheduleFileStem(ageGroup: string, teamName: string): string {
  const stem = `${ageGroup} ${teamName}`.trim().replace(/[^a-zA-Z0-9]+/g, "-");
  return stem.replace(/^-+|-+$/g, "") || "team-schedule";
}

type SchedulePdfInput = {
  ageGroup: string;
  teamName: string;
  seasonName?: string;
  orgName?: string;
  practiceWindow?: string;
  gamesWindow?: string;
  games: CoachNotifyGameLine[];
  practices: CoachNotifyPracticeLine[];
};

function lastTableY(doc: jsPDF, fallback: number): number {
  const table = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof table?.finalY === "number" ? table.finalY : fallback;
}

export function buildCoachSchedulePdf(input: SchedulePdfInput): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
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
  doc.text(`${input.ageGroup} ${input.teamName}`, margin, y);
  y += 16;

  if (input.seasonName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...HEADER_GRAY);
    doc.text(input.seasonName, margin, y);
    y += 18;
  }

  const practiceTitle = `Practice${input.practiceWindow ? ` (${input.practiceWindow})` : ""}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(practiceTitle, margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Day", "Start", "Park", "Field", "Pair", "Notes"]],
    body: input.practices.length
      ? input.practices.map((slot) => [
          slot.day,
          slot.startTime,
          slot.parkName || "—",
          slot.fieldName || "—",
          slot.pairedTeamName || "—",
          slot.notes || "—",
        ])
      : [["No practice slot assigned yet.", "", "", "", "", ""]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 5, valign: "top" },
    headStyles: { fillColor: AP_RED, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ROW_STRIPE },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 70 },
      2: { cellWidth: 170 },
      3: { cellWidth: 120 },
      4: { cellWidth: 100 },
    },
  });

  y = lastTableY(doc, y) + 22;
  const gamesTitle = `Games${input.gamesWindow ? ` (${input.gamesWindow})` : ""}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(gamesTitle, margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Date", "Start", "Opponent", "Home/Away", "Park", "Field"]],
    body: input.games.length
      ? input.games.map((game) => [
          game.date,
          game.startTime,
          game.opponent,
          game.home ? "Home" : "Away",
          game.parkName || "—",
          game.fieldName || "—",
        ])
      : [["No placed games in the draft yet.", "", "", "", "", ""]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 5, valign: "top" },
    headStyles: { fillColor: AP_RED, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ROW_STRIPE },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 70 },
      2: { cellWidth: 130 },
      3: { cellWidth: 80 },
      4: { cellWidth: 170 },
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...HEADER_GRAY);
    doc.text(
      `${input.ageGroup} ${input.teamName}${input.seasonName ? ` · ${input.seasonName}` : ""}`,
      margin,
      doc.internal.pageSize.getHeight() - 24,
    );
    doc.text(
      String(page),
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 24,
      { align: "right" },
    );
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export function buildCoachScheduleAttachments(input: SchedulePdfInput): ResendAttachment[] {
  const stem = coachScheduleFileStem(input.ageGroup, input.teamName);
  const pdf = buildCoachSchedulePdf(input);
  return [
    {
      filename: `${stem}.pdf`,
      content: pdf.toString("base64"),
      contentType: "application/pdf",
    },
  ];
}
