import { NextRequest, NextResponse } from "next/server";

import { loadParishFieldPrepReport } from "@/lib/admin/loadParishFieldPrep";
import { loadParishEnrollmentReport } from "@/lib/admin/loadParishEnrollment";
import { loadUmpirePayReport } from "@/lib/admin/loadUmpirePay";
import { ensureAdminModule } from "@/lib/news/auth";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { requireReportContentOrg } from "@/lib/admin/reportOrg";
import { getOrgDisplayName } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind")?.trim();
  const module = kind === "umpire-pay" ? "REPORTS" : kind === "parish-enrollment" ? "ENROLLMENT_KPI" : "TEAMS";
  const auth = await ensureAdminModule(request, module);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  try {
    const orgId = requireReportContentOrg(request.nextUrl.searchParams.get("org"));
    const orgName = getOrgDisplayName(orgId);
    const season = getSeasonConfigForOrg(orgId);

    if (kind === "parish-field-prep") {
      const report = await loadParishFieldPrepReport(orgId);
      return NextResponse.json({
        kind,
        subject: `${orgName} parish field prep — ${report.seasonName}`,
        html: `<p>Hi,</p><p>The AP Baseball field-prep report for <strong>${orgName}</strong> is attached (${report.bookedCount} booked slots).</p>`,
        filename: report.filename,
        pdfBase64: report.pdf.toString("base64"),
        bookedCount: report.bookedCount,
      });
    }

    if (kind === "parish-enrollment") {
      const report = await loadParishEnrollmentReport({
        organizationId: orgId,
        seasonYear: season.year,
        orgName,
        seasonLabel: season.label,
      });
      return NextResponse.json({
        kind,
        subject: `${orgName} enrollment & revenue — ${season.label}`,
        html: `<p>Hi,</p><p>The AP Baseball enrollment and revenue report for <strong>${orgName}</strong> is attached (${report.rowCount} players). A CSV is included for Excel.</p>`,
        filename: report.filename,
        pdfBase64: report.pdf.toString("base64"),
        csvFilename: report.csvFilename,
        csvBase64: Buffer.from(report.csv).toString("base64"),
        rowCount: report.rowCount,
      });
    }

    if (kind === "umpire-pay") {
      const startDate = request.nextUrl.searchParams.get("startDate")?.trim();
      const endDate = request.nextUrl.searchParams.get("endDate")?.trim();
      if (!startDate || !endDate) {
        return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
      }
      const report = await loadUmpirePayReport({
        orgId,
        orgName,
        startDate,
        endDate,
        league: request.nextUrl.searchParams.get("league"),
      });
      return NextResponse.json({
        kind,
        subject: `${orgName} umpire pay — ${startDate} to ${endDate}`,
        html: `<p>Hi,</p><p>AP Baseball umpire pay reports for <strong>${orgName}</strong> (${startDate}–${endDate}) are attached: pay by park and pay by person.</p>`,
        files: [
          { filename: report.parkFilename, pdfBase64: report.parkPdf.toString("base64") },
          { filename: report.umpireFilename, pdfBase64: report.umpirePdf.toString("base64") },
        ],
      });
    }

    return NextResponse.json({ error: "Unknown report kind" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to preview report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
