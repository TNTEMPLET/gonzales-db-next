import { jsPDF } from "jspdf";

import {
  groupParishEnrollmentByDivision,
  parishOutboundRows,
  type ParishEnrollmentRow,
  type ParishEnrollmentSummary,
} from "@/lib/admin/parishEnrollmentMoney";
import {
  formatCents,
  pdfToBuffer,
  reportFilenameStem,
  reportTable,
  stampReportFooter,
  writeReportLetterhead,
} from "@/lib/admin/reportPdf";

export type { ParishEnrollmentRow };

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function parishEnrollmentCsv(rows: ParishEnrollmentRow[], orgName: string): string {
  const header = ["Organization", "Player", "Address", "DOB", "Division", "Team"];
  const lines = [
    header.join(","),
    ...parishOutboundRows(rows).map((row) =>
      [orgName, row.fullName, row.address, row.dob, row.ageGroup, row.teamName].map(csvCell).join(","),
    ),
  ];
  return lines.join("\n");
}

export function buildParishIncomePdf(input: {
  orgName: string;
  seasonLabel: string;
  summary: ParishEnrollmentSummary;
}): { pdf: Buffer; filename: string } {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const margin = 48;
  let y = writeReportLetterhead(doc, margin, {
    orgName: input.orgName,
    title: "Parish income",
    subtitle: input.seasonLabel,
  });

  const metricRows: [string, string][] = [
    ["Enrollments", String(input.summary.totalEnrollments)],
    ["Gross registered", formatCents(input.summary.grossCents)],
    ["Collected", formatCents(input.summary.collectedCents)],
    ["Outstanding", formatCents(input.summary.outstandingCents)],
    ["Credit-card processing (3.4%)", formatCents(input.summary.ccProcessingFeeCents)],
    ["SportsConnect fees ($3 / player)", formatCents(input.summary.onlineFeeCents)],
    ["Net income", formatCents(input.summary.netDueCents)],
    ["Due to Ascension Parish Rec (10% of net)", formatCents(input.summary.parishRecDueCents)],
  ];

  y = reportTable(doc, y, margin, ["Metric", "Amount"], metricRows, {
    columnStyles: { 0: { cellWidth: 360 }, 1: { cellWidth: "auto" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index >= 6) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = reportTable(
    doc,
    y,
    margin,
    ["Registration amount", "Players", "Collected"],
    input.summary.paidByAmount.map((tier) => [
      formatCents(tier.amountCents),
      String(tier.count),
      formatCents(tier.collectedCents),
    ]),
  );

  reportTable(
    doc,
    y,
    margin,
    ["Division", "Enrolled", "Rostered", "Unrostered", "Collected"],
    input.summary.perDivision.map((row) => [
      row.ageGroup,
      String(row.enrolled),
      String(row.rostered),
      String(row.unrostered),
      formatCents(row.collectedCents),
    ]),
  );

  stampReportFooter(doc, margin, `AP Baseball · ${input.orgName} · ${input.seasonLabel}`);
  const stem = reportFilenameStem([input.orgName, input.seasonLabel, "parish-income"]);
  return { pdf: pdfToBuffer(doc), filename: `${stem}.pdf` };
}

export function buildParishRegistrationPdf(input: {
  orgName: string;
  seasonLabel: string;
  rows: ParishEnrollmentRow[];
}): { pdf: Buffer; filename: string } {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const margin = 36;
  let y = writeReportLetterhead(doc, margin, {
    orgName: input.orgName,
    title: "Parish registration",
    subtitle: input.seasonLabel,
  });

  const pageBottom = doc.internal.pageSize.getHeight() - 48;
  const groups = groupParishEnrollmentByDivision(parishOutboundRows(input.rows));
  const columns = ["Player", "Address", "DOB", "Team"];
  const columnStyles = {
    0: { cellWidth: 150 },
    1: { cellWidth: 320 },
    2: { cellWidth: 70 },
    3: { cellWidth: "auto" as const },
  };

  if (!groups.length) {
    reportTable(doc, y, margin, columns, [], { fontSize: 8, columnStyles });
  }
  for (const group of groups) {
    if (y > pageBottom - 72) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(group.ageGroup, margin, y);
    y += 8;
    y = reportTable(
      doc,
      y,
      margin,
      columns,
      group.rows.map((row) => [row.fullName, row.address, row.dob, row.teamName]),
      { fontSize: 8, columnStyles },
    );
  }

  stampReportFooter(doc, margin, `AP Baseball · ${input.orgName} · ${input.seasonLabel}`);
  const stem = reportFilenameStem([input.orgName, input.seasonLabel, "parish-registration"]);
  return { pdf: pdfToBuffer(doc), filename: `${stem}.pdf` };
}
