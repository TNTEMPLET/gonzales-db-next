import { jsPDF } from "jspdf";

import type { EnrollmentKpiSummary } from "@/lib/enrollment/kpi";
import {
  groupParishEnrollmentByDivision,
  type ParishEnrollmentRow,
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

export function parishEnrollmentCsv(rows: ParishEnrollmentRow[], orgName: string): string {
  const header = ["Organization", "Player", "Division", "Team", "Fee", "Amount", "Paid", "Balance", "Status"];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        orgName,
        row.fullName,
        row.ageGroup,
        row.teamName,
        row.feeDescription,
        (row.amountCents / 100).toFixed(2),
        (row.paidCents / 100).toFixed(2),
        (row.balanceCents / 100).toFixed(2),
        row.paymentStatus,
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    ),
  ];
  return lines.join("\n");
}

export function buildParishEnrollmentPdf(input: {
  orgName: string;
  seasonLabel: string;
  summary: EnrollmentKpiSummary;
  rows: ParishEnrollmentRow[];
}): { pdf: Buffer; filename: string } {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const margin = 48;
  let y = writeReportLetterhead(doc, margin, {
    orgName: input.orgName,
    title: "Parish enrollment & revenue",
    subtitle: input.seasonLabel,
  });

  y = reportTable(
    doc,
    y,
    margin,
    ["Metric", "Amount"],
    [
      ["Enrollments", String(input.summary.totalEnrollments)],
      ["Gross registered", formatCents(input.summary.grossCents)],
      ["Collected", formatCents(input.summary.collectedCents)],
      ["Outstanding", formatCents(input.summary.outstandingCents)],
      ["Credit-card processing", formatCents(input.summary.ccProcessingFeeCents)],
      ["Online registration fees", formatCents(input.summary.onlineFeeCents)],
      ["Net due", formatCents(input.summary.netDueCents)],
    ],
  );

  y = reportTable(
    doc,
    y,
    margin,
    ["Fee tier", "Count", "Gross", "Collected"],
    input.summary.feeTierBreakdown.map((tier) => [
      tier.orderDetailDescription,
      String(tier.count),
      formatCents(tier.grossCents),
      formatCents(tier.collectedCents),
    ]),
  );

  y = reportTable(
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

  const pageBottom = doc.internal.pageSize.getHeight() - 48;
  if (y > pageBottom - 80) {
    doc.addPage();
    y = margin;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text("Enrollment list", margin, y);
  y += 16;

  const groups = groupParishEnrollmentByDivision(input.rows);
  if (!groups.length) {
    y = reportTable(doc, y, margin, ["Player", "Team", "Fee", "Amount", "Paid", "Balance"], []);
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
      ["Player", "Team", "Fee", "Amount", "Paid", "Balance"],
      group.rows.map((row) => [
        row.fullName,
        row.teamName,
        row.feeDescription,
        formatCents(row.amountCents),
        formatCents(row.paidCents),
        formatCents(row.balanceCents),
      ]),
    );
  }

  stampReportFooter(doc, margin, `AP Baseball · ${input.orgName} · ${input.seasonLabel}`);
  const stem = reportFilenameStem([input.orgName, input.seasonLabel, "parish-enrollment"]);
  return { pdf: pdfToBuffer(doc), filename: `${stem}.pdf` };
}
