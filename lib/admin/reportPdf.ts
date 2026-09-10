import { jsPDF } from "jspdf";
import autoTable, { type CellHookData } from "jspdf-autotable";

export const AP_RED: [number, number, number] = [204, 0, 0];
export const HEADER_GRAY: [number, number, number] = [80, 80, 80];
export const ROW_STRIPE: [number, number, number] = [245, 245, 245];

export function lastTableY(doc: jsPDF, fallback: number): number {
  const table = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof table?.finalY === "number" ? table.finalY : fallback;
}

export function writeReportLetterhead(
  doc: jsPDF,
  margin: number,
  input: { orgName: string; title: string; subtitle?: string },
): number {
  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...AP_RED);
  doc.text("AP BASEBALL", margin, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(input.title, margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...HEADER_GRAY);
  doc.text(input.orgName, margin, y);
  y += 12;
  if (input.subtitle) {
    doc.setFontSize(10);
    doc.text(input.subtitle, margin, y);
    y += 12;
  }
  doc.setDrawColor(...AP_RED);
  doc.setLineWidth(1.5);
  doc.line(margin, y, doc.internal.pageSize.getWidth() - margin, y);
  return y + 14;
}

export function stampReportFooter(doc: jsPDF, margin: number, label: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...HEADER_GRAY);
    doc.text(label, margin, doc.internal.pageSize.getHeight() - 24);
    doc.text(String(page), pageWidth - margin, doc.internal.pageSize.getHeight() - 24, { align: "right" });
  }
}

export function reportTable(
  doc: jsPDF,
  startY: number,
  margin: number,
  head: string[],
  body: string[][],
  options?: {
    didParseCell?: (data: CellHookData) => void;
    fontSize?: number;
    striped?: boolean;
  },
) {
  autoTable(doc, {
    startY,
    head: [head],
    body: body.length ? body : [["No rows.", ...head.slice(1).map(() => "")]],
    margin: { left: margin, right: margin },
    styles: { fontSize: options?.fontSize ?? 9, cellPadding: 4, valign: "top" },
    headStyles: { fillColor: AP_RED, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: options?.striped === false ? undefined : { fillColor: ROW_STRIPE },
    didParseCell: options?.didParseCell,
  });
  return lastTableY(doc, startY) + 16;
}

export function formatReportClock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hours = Number(match[1]);
  return `${((hours + 11) % 12) + 1}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

export function formatReportDate(key: string): string {
  const [, month, day] = key.split("-");
  if (!month || !day) return key;
  return `${Number(month)}/${Number(day)}/${key.slice(0, 4)}`;
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function pdfToBuffer(doc: jsPDF): Buffer {
  return Buffer.from(doc.output("arraybuffer"));
}

export function reportFilenameStem(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
