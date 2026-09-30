import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { dateLabelSortValue, groupPayByPark, weekdayName } from "@/lib/admin/umpirePayGroups";
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

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function assignmentCell(row: UmpireGameRow): string {
  if (row.umpires.length === 0) return "No assignment";
  return row.umpires.map((ump) => `${ump.name} ${money(ump.pay)}`).join("; ");
}

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

      autoTable(doc, {
        startY: y,
        head: [["Time", "Home", "Away", "Field", "Division", "Assignments", "Pay"]],
        body: day.games.map((game) => [
          game.time,
          game.homeTeam,
          game.awayTeam,
          game.subvenue || "—",
          game.ageGroup,
          assignmentCell(game),
          money(game.gamePayTotal),
        ]),
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
        columnStyles: {
          0: { cellWidth: 48 },
          1: { cellWidth: 100 },
          2: { cellWidth: 100 },
          3: { cellWidth: 56 },
          4: { cellWidth: 56 },
          5: { cellWidth: "auto" },
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
