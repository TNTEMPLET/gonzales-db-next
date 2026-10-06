/**
 * Three-page print sheet of the saved Spring combined divisions.
 * Page 1 is both leagues. Page 2 is Gonzales DYB. Page 3 is Ascension LL.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { AP_RED, HEADER_GRAY, ROW_STRIPE, writeReportLetterhead } from "@/lib/admin/reportPdf";

import { springDivisionsPdfFilename, type SpringDivisionSheetRow } from "./divisionSheet";
import type { SpringLeagueOrg } from "./view";

export { springDivisionsPdfFilename };

const MARGIN = 36;

export type SpringDivisionsPdf = {
  buffer: Uint8Array;
  pageCount: number;
  filename: string;
};

type SheetSpec = {
  title: string;
  detail: string;
  footer: string;
  rows: readonly SpringDivisionSheetRow[];
};

function sheetRows(rows: readonly SpringDivisionSheetRow[], org?: SpringLeagueOrg): SpringDivisionSheetRow[] {
  if (!org) return [...rows];
  return rows.filter((row) => row.organizationId === org);
}

function tableBody(rows: readonly SpringDivisionSheetRow[]): string[][] {
  if (rows.length === 0) {
    return [["No saved divisions for this league.", "", "", "", "", ""]];
  }
  return rows.map((row) => [
    row.displayName,
    row.league,
    row.ages,
    row.cutoff,
    row.oldestLabel || "—",
    row.youngestLabel || "—",
  ]);
}

function drawSheet(doc: jsPDF, spec: SheetSpec, first: boolean): { start: number; end: number; footer: string } {
  if (!first) doc.addPage();
  const start = doc.getNumberOfPages();
  const y = writeReportLetterhead(doc, MARGIN, {
    title: spec.title,
    orgName: spec.detail,
    subtitle: "Oldest and youngest birthdates are the inclusive window. Dates come from the saved division ages.",
  });
  autoTable(doc, {
    startY: y,
    head: [["Division", "League", "Ages", "Cutoff", "Oldest", "Youngest"]],
    body: tableBody(spec.rows),
    margin: { left: MARGIN, right: MARGIN, bottom: 40 },
    styles: { fontSize: 9, cellPadding: 3.5, valign: "middle", overflow: "linebreak", textColor: [20, 20, 20] },
    headStyles: { fillColor: AP_RED, textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: ROW_STRIPE },
    columnStyles: {
      0: { cellWidth: 168, fontStyle: "bold" },
      1: { cellWidth: 100 },
      2: { cellWidth: 52, halign: "center" },
      3: { cellWidth: 118 },
      4: { cellWidth: 124 },
      5: { cellWidth: 158 },
    },
  });
  return { start, end: doc.getNumberOfPages(), footer: spec.footer };
}

function stampFooters(doc: jsPDF, ranges: { start: number; end: number; footer: string }[]) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (const range of ranges) {
    for (let page = range.start; page <= range.end; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...HEADER_GRAY);
      doc.text(range.footer, MARGIN, pageHeight - 24);
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 24, { align: "right" });
    }
  }
}

export function buildSpringDivisionsPdf(input: {
  seasonYear: number;
  rows: readonly SpringDivisionSheetRow[];
}): SpringDivisionsPdf {
  const year = input.seasonYear;
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const sheets: SheetSpec[] = [
    {
      title: `AP Baseball Spring ${year} — Combined Divisions`,
      detail: "Gonzales DYB and Ascension LL",
      footer: "Combined · Gonzales DYB + Ascension LL",
      rows: sheetRows(input.rows),
    },
    {
      title: `AP Baseball Spring ${year} — Gonzales DYB`,
      detail: "Gonzales Diamond Youth only",
      footer: "Gonzales DYB only",
      rows: sheetRows(input.rows, "gonzales"),
    },
    {
      title: `AP Baseball Spring ${year} — Ascension LL`,
      detail: "Ascension Little League only",
      footer: "Ascension LL only",
      rows: sheetRows(input.rows, "ascension"),
    },
  ];
  const ranges = sheets.map((sheet, index) => drawSheet(doc, sheet, index === 0));
  stampFooters(doc, ranges);
  return {
    buffer: new Uint8Array(doc.output("arraybuffer")),
    pageCount: doc.getNumberOfPages(),
    filename: springDivisionsPdfFilename(year),
  };
}

export function downloadSpringDivisionsPdf(pdf: SpringDivisionsPdf): void {
  const copy = new ArrayBuffer(pdf.buffer.byteLength);
  new Uint8Array(copy).set(pdf.buffer);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = pdf.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
