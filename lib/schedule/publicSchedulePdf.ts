import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  comparePublicPractices,
  groupPublicGames,
  groupPublicPractices,
  type PublicPracticeSlot,
  type PublicScheduleGame,
} from "./publicSchedule";

const AP_RED: [number, number, number] = [204, 0, 0];
const HEADER_GRAY: [number, number, number] = [80, 80, 80];
const ROW_STRIPE: [number, number, number] = [245, 245, 245];

type PdfResult = {
  buffer: Uint8Array;
  pageCount: number;
};

function lastTableY(doc: jsPDF, fallback: number): number {
  const table = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof table?.finalY === "number" ? table.finalY : fallback;
}

function outputPdf(doc: jsPDF): PdfResult {
  return {
    buffer: new Uint8Array(doc.output("arraybuffer")),
    pageCount: doc.getNumberOfPages(),
  };
}

function writeHeader(
  doc: jsPDF,
  margin: number,
  y: number,
  lines: { text: string; size: number; bold?: boolean; color?: [number, number, number] }[],
): number {
  let cursor = y;
  for (const line of lines) {
    doc.setFont("helvetica", line.bold ? "bold" : "normal");
    doc.setFontSize(line.size);
    doc.setTextColor(...(line.color ?? [0, 0, 0]));
    doc.text(line.text, margin, cursor);
    cursor += line.size + 4;
  }
  return cursor;
}

function ensureRoom(doc: jsPDF, y: number, needed: number, margin: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed < pageHeight - margin) return y;
  doc.addPage();
  return margin;
}

export function buildTeamSchedulePdf(input: {
  orgName: string;
  seasonName: string;
  ageGroup: string;
  teamName: string;
  games: PublicScheduleGame[];
  practices: PublicPracticeSlot[];
  fontSize?: number;
}): PdfResult {
  const fontSize = input.fontSize ?? 8;
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const margin = 36;
  let y = margin;

  y = writeHeader(doc, margin, y, [
    { text: input.orgName.toUpperCase(), size: 8, color: HEADER_GRAY },
    { text: `${input.ageGroup} ${input.teamName}`, size: 14, bold: true },
    { text: input.seasonName, size: 10, color: HEADER_GRAY },
  ]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Practices", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Date", "Day", "Time", "Park", "Field", "Shares with"]],
    body: input.practices.length
      ? [...input.practices].sort(comparePublicPractices).map((slot) => [
          slot.dateLabel ? slot.dateLabel.replace(/^[A-Za-z]{3},\s/, "") : "Weekly",
          slot.weekdayName,
          slot.timeLabel,
          slot.parkName,
          slot.fieldName,
          slot.pairTeamName || "—",
        ])
      : [["No practice slot assigned.", "", "", "", "", ""]],
    margin: { left: margin, right: margin },
    styles: { fontSize, cellPadding: 2.5, valign: "middle", overflow: "linebreak" },
    headStyles: { fillColor: AP_RED, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ROW_STRIPE },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 70 },
      2: { cellWidth: 60 },
      3: { cellWidth: 150 },
      4: { cellWidth: 120 },
    },
  });

  y = lastTableY(doc, y) + 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Games", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Date", "Time", "Opponent", "H/A", "Park", "Field"]],
    body: input.games.length
      ? input.games.map((game) => {
          const home = game.homeTeam === input.teamName;
          return [
            game.dateLabel,
            game.timeLabel,
            home ? game.awayTeam : game.homeTeam,
            home ? "Home" : "Away",
            game.parkName,
            game.fieldName,
          ];
        })
      : [["No games placed yet.", "", "", "", "", ""]],
    margin: { left: margin, right: margin },
    styles: { fontSize, cellPadding: 2.5, valign: "middle", overflow: "linebreak" },
    headStyles: { fillColor: AP_RED, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ROW_STRIPE },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 60 },
      2: { cellWidth: 140 },
      3: { cellWidth: 50 },
      4: { cellWidth: 170 },
    },
  });

  const result = outputPdf(doc);
  if (result.pageCount > 1 && fontSize > 7) {
    return buildTeamSchedulePdf({ ...input, fontSize: 7 });
  }
  return result;
}

export function buildSeasonGamesPdf(input: {
  orgName: string;
  seasonName: string;
  subtitle?: string;
  games: PublicScheduleGame[];
}): PdfResult {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const margin = 36;
  let y = margin;
  const groups = groupPublicGames(input.games);

  y = writeHeader(doc, margin, y, [
    { text: input.orgName.toUpperCase(), size: 8, color: HEADER_GRAY },
    { text: `${input.seasonName} schedule`, size: 14, bold: true },
    { text: input.subtitle || "All games", size: 10, color: HEADER_GRAY },
  ]);

  if (!groups.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("No games in this view.", margin, y);
    return outputPdf(doc);
  }

  for (const park of groups) {
    y = ensureRoom(doc, y, 90, margin);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(park.parkName, margin, y);
    y += 14;
    for (const field of park.fields) {
      y = ensureRoom(doc, y, 80, margin);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...HEADER_GRAY);
      doc.text(field.fieldName, margin, y);
      y += 12;
      for (const weekday of field.weekdays) {
        y = ensureRoom(doc, y, 70, margin);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(weekday.weekdayName, margin, y);
        autoTable(doc, {
          startY: y + 6,
          head: [["Date", "Time", "Age", "Home", "Away"]],
          body: weekday.games.map((game) => [
            game.dateLabel,
            game.timeLabel,
            game.ageGroup,
            game.homeTeam,
            game.awayTeam,
          ]),
          margin: { left: margin, right: margin },
          styles: { fontSize: 8, cellPadding: 2.5, valign: "middle" },
          headStyles: { fillColor: AP_RED, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: ROW_STRIPE },
          showHead: "everyPage",
        });
        y = lastTableY(doc, y) + 14;
      }
    }
  }

  return outputPdf(doc);
}

export function buildSeasonPracticesPdf(input: {
  orgName: string;
  seasonName: string;
  subtitle?: string;
  slots: PublicPracticeSlot[];
}): PdfResult {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const margin = 36;
  let y = margin;
  const groups = groupPublicPractices(input.slots);

  y = writeHeader(doc, margin, y, [
    { text: input.orgName.toUpperCase(), size: 8, color: HEADER_GRAY },
    { text: `${input.seasonName} practices`, size: 14, bold: true },
    { text: input.subtitle || "Weekly practice slots", size: 10, color: HEADER_GRAY },
  ]);

  if (!groups.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("No practice slots in this view.", margin, y);
    return outputPdf(doc);
  }

  for (const park of groups) {
    y = ensureRoom(doc, y, 90, margin);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(park.parkName, margin, y);
    y += 14;
    for (const dateGroup of park.dates) {
      y = ensureRoom(doc, y, 70, margin);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(dateGroup.dateLabel, margin, y);
      autoTable(doc, {
        startY: y + 6,
        head: [["Time", "Field", "Age", "Team", "Shares with"]],
        body: dateGroup.slots.map((slot) => [
          slot.timeLabel,
          slot.fieldName,
          slot.ageGroup,
          slot.teamName,
          slot.pairTeamName || "—",
        ]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2.5, valign: "middle" },
        headStyles: { fillColor: AP_RED, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: ROW_STRIPE },
        showHead: "everyPage",
      });
      y = lastTableY(doc, y) + 14;
    }
    for (const field of park.fields) {
      y = ensureRoom(doc, y, 80, margin);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...HEADER_GRAY);
      doc.text(field.fieldName, margin, y);
      y += 12;
      for (const weekday of field.weekdays) {
        y = ensureRoom(doc, y, 70, margin);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(weekday.weekdayName, margin, y);
        autoTable(doc, {
          startY: y + 6,
          head: [["Date", "Time", "Age", "Team", "Shares with"]],
          body: weekday.slots.map((slot) => [
            slot.dateLabel ? slot.dateLabel.replace(/^[A-Za-z]{3},\s/, "") : "Weekly",
            slot.timeLabel,
            slot.ageGroup,
            slot.teamName,
            slot.pairTeamName || "—",
          ]),
          margin: { left: margin, right: margin },
          styles: { fontSize: 8, cellPadding: 2.5, valign: "middle" },
          headStyles: { fillColor: AP_RED, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: ROW_STRIPE },
          showHead: "everyPage",
        });
        y = lastTableY(doc, y) + 14;
      }
    }
  }

  return outputPdf(doc);
}

export function downloadPdfBuffer(buffer: Uint8Array, filename: string) {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(buffer);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
