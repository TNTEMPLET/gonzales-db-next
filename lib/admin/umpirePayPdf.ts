import { jsPDF } from "jspdf";

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

export function buildPayByParkPdf(input: {
  orgName: string;
  startDate: string;
  endDate: string;
  rows: UmpireGameRow[];
}): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const margin = 40;
  let y = writeReportLetterhead(doc, margin, {
    orgName: input.orgName,
    title: "Umpire pay by park",
    subtitle: `${input.startDate} – ${input.endDate}`,
  });
  y = reportTable(
    doc,
    y,
    margin,
    ["Date", "Time", "Home", "Away", "Park", "Field", "Division", "Assignments", "Pay"],
    input.rows.map((row) => [
      row.date,
      row.time,
      row.homeTeam,
      row.awayTeam,
      row.venue,
      row.subvenue || "—",
      row.ageGroup,
      row.umpires.map((ump) => `${ump.name} ${money(ump.pay)}`).join("; ") || "No assignment",
      money(row.gamePayTotal),
    ]),
  );
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
  let y = writeReportLetterhead(doc, margin, {
    orgName: input.orgName,
    title: "Umpire pay by person",
    subtitle: `${input.startDate} – ${input.endDate}`,
  });
  y = reportTable(
    doc,
    y,
    margin,
    ["Park", "Date", "Umpire", "Games", "Pay"],
    input.rows.map((row) => [row.park, row.date, row.umpireName, String(row.games), money(row.totalPay)]),
  );
  stampReportFooter(doc, margin, `AP Baseball · ${input.orgName} · umpire pay`);
  return pdfToBuffer(doc);
}
