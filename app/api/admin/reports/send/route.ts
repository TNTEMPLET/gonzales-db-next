import { NextRequest, NextResponse } from "next/server";

import { loadParishFieldPrepReport } from "@/lib/admin/loadParishFieldPrep";
import { parseReportEmails } from "@/lib/admin/parseReportEmails";
import { loadParishEnrollmentReport } from "@/lib/admin/loadParishEnrollment";
import { loadUmpirePayReport } from "@/lib/admin/loadUmpirePay";
import { getDefaultFromAddress } from "@/lib/communications/fromAddresses";
import { sendOrderReportEmail } from "@/lib/communications/orderReportEmail";
import { ensureAdminModule } from "@/lib/news/auth";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { requireReportContentOrg } from "@/lib/admin/reportOrg";
import { getOrgDisplayName } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    org?: string;
    emails?: string;
    startDate?: string;
    endDate?: string;
    league?: string;
  };
  const kind = body.kind?.trim();
  const module = kind === "umpire-pay" ? "REPORTS" : kind === "parish-enrollment" ? "ENROLLMENT_KPI" : "TEAMS";
  const auth = await ensureAdminModule(request, module);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = parseReportEmails(body.emails ?? "");
  if (!parsed.emails.length) {
    return NextResponse.json({ error: "Enter at least one recipient email" }, { status: 400 });
  }

  try {
    const orgId = requireReportContentOrg(body.org ?? request.nextUrl.searchParams.get("org"));
    const orgName = getOrgDisplayName(orgId);
    const season = getSeasonConfigForOrg(orgId);
    const fromEmail = await getDefaultFromAddress();
    const replyTo = auth.admin.email;

    if (kind === "parish-field-prep") {
      const report = await loadParishFieldPrepReport(orgId);
      const result = await sendOrderReportEmail({
        actorAdminId: auth.admin.id,
        actorEmail: auth.admin.email,
        organizationId: orgId,
        campaignTitlePrefix: "Parish Field Prep",
        sourceType: "PARISH_FIELD_PREP",
        recipients: parsed.emails,
        subject: `${orgName} parish field prep — ${report.seasonName}`,
        text: `The AP Baseball field-prep report for ${orgName} is attached (${report.bookedCount} booked slots).`,
        html: `<p>Hi,</p><p>The AP Baseball field-prep report for <strong>${orgName}</strong> is attached (${report.bookedCount} booked slots).</p>`,
        fromEmail,
        replyTo,
        attachments: [{ filename: report.filename, content: report.pdf.toString("base64"), contentType: "application/pdf" }],
      });
      return NextResponse.json({ ok: true, ...result, skipped: parsed.skipped });
    }

    if (kind === "parish-enrollment") {
      const report = await loadParishEnrollmentReport({
        organizationId: orgId,
        seasonYear: season.year,
        orgName,
        seasonLabel: season.label,
      });
      const result = await sendOrderReportEmail({
        actorAdminId: auth.admin.id,
        actorEmail: auth.admin.email,
        organizationId: orgId,
        campaignTitlePrefix: "Parish Enrollment",
        sourceType: "PARISH_ENROLLMENT",
        recipients: parsed.emails,
        subject: `${orgName} enrollment & revenue — ${season.label}`,
        text: `The AP Baseball enrollment and revenue report for ${orgName} is attached (${report.rowCount} players).`,
        html: `<p>Hi,</p><p>The AP Baseball enrollment and revenue report for <strong>${orgName}</strong> is attached (${report.rowCount} players). A CSV is included for Excel.</p>`,
        fromEmail,
        replyTo,
        attachments: [
          { filename: report.filename, content: report.pdf.toString("base64"), contentType: "application/pdf" },
          { filename: report.csvFilename, content: Buffer.from(report.csv).toString("base64"), contentType: "text/csv" },
        ],
      });
      return NextResponse.json({ ok: true, ...result, skipped: parsed.skipped });
    }

    if (kind === "umpire-pay") {
      const startDate = body.startDate?.trim();
      const endDate = body.endDate?.trim();
      if (!startDate || !endDate) {
        return NextResponse.json({ error: "Generate an umpire report date range first" }, { status: 400 });
      }
      const report = await loadUmpirePayReport({
        orgId,
        orgName,
        startDate,
        endDate,
        league: body.league,
      });
      const result = await sendOrderReportEmail({
        actorAdminId: auth.admin.id,
        actorEmail: auth.admin.email,
        organizationId: orgId,
        campaignTitlePrefix: "Umpire Pay",
        sourceType: "UMPIRE_PAY",
        recipients: parsed.emails,
        subject: `${orgName} umpire pay — ${startDate} to ${endDate}`,
        text: `AP Baseball umpire pay reports for ${orgName} (${startDate}–${endDate}) are attached.`,
        html: `<p>Hi,</p><p>AP Baseball umpire pay reports for <strong>${orgName}</strong> (${startDate}–${endDate}) are attached: pay by park and pay by person.</p>`,
        fromEmail,
        replyTo,
        attachments: [
          { filename: report.parkFilename, content: report.parkPdf.toString("base64"), contentType: "application/pdf" },
          { filename: report.umpireFilename, content: report.umpirePdf.toString("base64"), contentType: "application/pdf" },
        ],
      });
      return NextResponse.json({ ok: true, ...result, skipped: parsed.skipped });
    }

    return NextResponse.json({ error: "Unknown report kind" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send report";
    const status = /disabled/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
