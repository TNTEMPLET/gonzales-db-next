import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { assignmentColumnPair, dayUsesTwoAssignmentColumns } from "@/lib/admin/umpirePayAssignments";
import { formatReportFieldName } from "@/lib/admin/umpirePayFieldLabel";
import { dateLabelSortValue, groupPayByPark, weekdayName } from "@/lib/admin/umpirePayGroups";
import { formatUmpirePayMoney, writeUmpirePayTotalBanner } from "@/lib/admin/umpirePayTotalBanner";
import {
  pdfToBuffer,
  reportTable,
  stampReportFooter,
  writeReportLetterhead,
} from "@/lib/admin/reportPdf";

export type UmpireGameRow = {
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  subvenue: string;
  ageGroup: string;
  umpires: { name: string; pay: number }[];
  gamePayTotal: number;
};

export type UmpirePayRow = {
  park: string;
  date: string;
  umpireName: string;
  games: number;
  totalPay: number;
};

const money = formatUmpirePayMoney;

export function buildPayByParkPdf(input: {
  orgName: string;
  startDate: string;
  endDate: string;
  rows: UmpireGameRow[];
}): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = writeReportLetterhead(doc, margin, {
    orgName: input.orgName,
    title: "Umpire pay by park",
    subtitle: `${input.startDate} – ${input.endDate}`,
  });

  const parks = groupPayByPark(input.rows);
  const totalPay = parks.reduce((sum, park) => sum + park.totalPay, 0);
  y = writeUmpirePayTotalBanner(doc, y, margin, contentWidth, totalPay);
  if (parks.length === 0) {
    reportTable(doc, y, margin, ["Park", "Day", "Games", "Pay"], [["No rows.", "", "", ""]]);
    stampReportFooter(doc, margin, `AP Baseball · ${input.orgName} · umpire pay`);
    return pdfToBuffer(doc);
  }

  let firstPark = true;
  for (const park of parks) {
    if (firstPark) {
      firstPark = false;
    } else {
      doc.addPage();
      y = margin;
    }

    const parkBarHeight = 28;
    doc.setFillColor(139, 26, 26);
    doc.rect(margin, y, contentWidth, parkBarHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(park.park, margin + 8, y + 18);
    doc.text(`Total Pay: ${money(park.totalPay)}`, margin + contentWidth - 8, y + 18, { align: "right" });
    y += parkBarHeight + 6;

    for (const day of park.days) {
      const dayBarHeight = 16;
      if (y + dayBarHeight + 48 > pageHeight - 48) {
        doc.addPage();
        y = margin;
      }
      const dayLabel = [day.dayName, day.date].filter(Boolean).join("  —  ");
      doc.setFillColor(230, 230, 230);
      doc.rect(margin, y, contentWidth, dayBarHeight, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(50, 50, 50);
      doc.text(dayLabel, margin + 6, y + 11);
      doc.text(`Day Total: ${money(day.totalPay)}`, margin + contentWidth - 6, y + 11, { align: "right" });
      y += dayBarHeight;

      const twoAssignments = dayUsesTwoAssignmentColumns(day.games);
      autoTable(doc, {
        startY: y,
        tableWidth: contentWidth,
        head: [
          twoAssignments
            ? ["Time", "Home", "Away", "Field", "Division", "Assignment 1", "Assignment 2", "Pay"]
            : ["Time", "Home", "Away", "Field", "Division", "Assignments", "Pay"],
        ],
        body: day.games.map((game) => {
          const [left, right] = assignmentColumnPair(game.umpires, money);
          const base = [
            game.time,
            game.homeTeam,
            game.awayTeam,
            formatReportFieldName(game.subvenue),
            game.ageGroup,
          ];
          if (twoAssignments) return [...base, left, right, money(game.gamePayTotal)];
          return [...base, left, money(game.gamePayTotal)];
        }),
        theme: "grid",
        styles: {
          fontSize: 8,
          cellPadding: 3,
          textColor: [30, 30, 30],
          lineColor: [210, 210, 210],
          lineWidth: 0.4,
        },
        headStyles: {
          fillColor: [60, 60, 60],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8,
        },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        columnStyles: twoAssignments
          ? {
              0: { cellWidth: 46 },
              1: { cellWidth: 88 },
              2: { cellWidth: 88 },
              3: { cellWidth: 100 },
              4: { cellWidth: 48 },
              5: { cellWidth: "auto", halign: "center" },
              6: { cellWidth: "auto", halign: "center" },
              7: { cellWidth: 56, halign: "right" },
            }
          : {
              0: { cellWidth: 48 },
              1: { cellWidth: 92 },
              2: { cellWidth: 92 },
              3: { cellWidth: 80 },
              4: { cellWidth: 52 },
              5: { cellWidth: "auto", halign: "center" },
              6: { cellWidth: 64, halign: "right" },
            },
        margin: { left: margin, right: margin },
      });
      const lastTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
      y = lastTable.finalY + 10;
    }
  }

  stampReportFooter(doc, margin, `AP Baseball · ${input.orgName} · umpire pay`);
  return pdfToBuffer(doc);
}

export function buildPayByUmpirePdf(input: {
  orgName: string;
  startDate: string;
  endDate: string;
  rows: UmpirePayRow[];
}): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = writeReportLetterhead(doc, margin, {
    orgName: input.orgName,
    title: "Umpire pay by person",
    subtitle: `${input.startDate} – ${input.endDate}`,
  });

  const byPark = new Map<string, Map<string, UmpirePayRow[]>>();
  for (const row of input.rows) {
    if (!byPark.has(row.park)) byPark.set(row.park, new Map());
    const byDate = byPark.get(row.park)!;
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date)!.push(row);
  }
  const parks = Array.from(byPark.entries())
    .map(([park, byDate]) => {
      const days = Array.from(byDate.entries())
        .map(([date, entries]) => ({
          date,
          dayName: weekdayName(date),
          totalPay: entries.reduce((sum, entry) => sum + entry.totalPay, 0),
          entries: [...entries].sort((a, b) => a.umpireName.localeCompare(b.umpireName)),
        }))
        .sort((a, b) => dateLabelSortValue(a.date) - dateLabelSortValue(b.date));
      return {
        park,
        days,
        totalPay: days.reduce((sum, day) => sum + day.totalPay, 0),
      };
    })
    .sort((a, b) => a.park.localeCompare(b.park));

  const totalPay = parks.reduce((sum, park) => sum + park.totalPay, 0);
  y = writeUmpirePayTotalBanner(doc, y, margin, contentWidth, totalPay);
  if (parks.length === 0) {
    reportTable(doc, y, margin, ["Park", "Date", "Umpire", "Games", "Pay"], [["No rows.", "", "", "", ""]]);
    stampReportFooter(doc, margin, `AP Baseball · ${input.orgName} · umpire pay`);
    return pdfToBuffer(doc);
  }

  let firstPark = true;
  for (const park of parks) {
    if (firstPark) {
      firstPark = false;
    } else {
      doc.addPage();
      y = margin;
    }
    const parkBarHeight = 28;
    doc.setFillColor(139, 26, 26);
    doc.rect(margin, y, contentWidth, parkBarHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(park.park, margin + 8, y + 18);
    doc.text(`Total Pay: ${money(park.totalPay)}`, margin + contentWidth - 8, y + 18, { align: "right" });
    y += parkBarHeight + 6;

    for (const day of park.days) {
      const dayBarHeight = 16;
      if (y + dayBarHeight + 48 > pageHeight - 48) {
        doc.addPage();
        y = margin;
      }
      const dayLabel = [day.dayName, day.date].filter(Boolean).join("  —  ");
      doc.setFillColor(230, 230, 230);
      doc.rect(margin, y, contentWidth, dayBarHeight, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(50, 50, 50);
      doc.text(dayLabel, margin + 6, y + 11);
      doc.text(`Day Total: ${money(day.totalPay)}`, margin + contentWidth - 6, y + 11, { align: "right" });
      y += dayBarHeight;

      autoTable(doc, {
        startY: y,
        head: [["Umpire", "Games", "Pay"]],
        body: day.entries.map((entry) => [entry.umpireName, String(entry.games), money(entry.totalPay)]),
        theme: "grid",
        styles: {
          fontSize: 9,
          cellPadding: 4,
          textColor: [30, 30, 30],
          lineColor: [210, 210, 210],
          lineWidth: 0.4,
        },
        headStyles: {
          fillColor: [60, 60, 60],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 9,
        },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        columnStyles: {
          0: { cellWidth: "auto" },
          1: { cellWidth: 50, halign: "center" },
          2: { cellWidth: 70, halign: "right" },
        },
        margin: { left: margin, right: margin },
      });
      const lastTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
      y = lastTable.finalY + 10;
    }
  }

  stampReportFooter(doc, margin, `AP Baseball · ${input.orgName} · umpire pay`);
  return pdfToBuffer(doc);
}
