import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import {
  buildJerseyReportForDivision,
  jerseyReportToCsv,
  jerseyReportToHtml,
} from "@/lib/admin/jerseyReport";
import { getDefaultFromAddress, resolveFromAddress } from "@/lib/communications/fromAddresses";
import { sendOrderReportEmail } from "@/lib/communications/orderReportEmail";
import { ensureAdminModule } from "@/lib/news/auth";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_RECIPIENTS = 10;

function parseRecipients(raw: unknown): string[] {
  if (typeof raw === "string") {
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

/** Preview a division's jersey report (used to show it before emailing). */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const seasonYear = Number(request.nextUrl.searchParams.get("seasonYear"));
  const ageGroup = request.nextUrl.searchParams.get("ageGroup")?.trim();
  if (!Number.isFinite(seasonYear) || !ageGroup) {
    return NextResponse.json({ error: "seasonYear and ageGroup are required" }, { status: 400 });
  }

  const report = await buildJerseyReportForDivision({
    organizationId: targetOrg,
    seasonYear,
    ageGroup,
  });
  const defaultFrom = await getDefaultFromAddress();

  return NextResponse.json({ report, html: jerseyReportToHtml(report), defaultFrom });
}

/** Emails a division's jersey report via the governed Communications send path. */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const admin = await getAdminUserFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as {
    seasonYear?: number;
    ageGroup?: string;
    to?: unknown;
    subject?: string;
    message?: string;
    fromEmail?: string | null;
  };

  const seasonYear = Number(body.seasonYear);
  const ageGroup = body.ageGroup?.trim();
  if (!Number.isFinite(seasonYear) || !ageGroup) {
    return NextResponse.json({ error: "seasonYear and ageGroup are required" }, { status: 400 });
  }

  const recipients = [...new Set(parseRecipients(body.to))];
  if (recipients.length === 0) {
    return NextResponse.json({ error: "Add at least one recipient email" }, { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `Too many recipients (max ${MAX_RECIPIENTS})` },
      { status: 400 },
    );
  }
  const invalid = recipients.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Invalid email address: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  const report = await buildJerseyReportForDivision({
    organizationId: targetOrg,
    seasonYear,
    ageGroup,
  });
  if (report.playerCount === 0) {
    return NextResponse.json({ error: "This division has no rostered players yet" }, { status: 400 });
  }

  const fromAddress = await resolveFromAddress(body.fromEmail);
  const subject = (body.subject ?? "").trim() || `Jersey Report – ${ageGroup} – ${seasonYear}`;
  const customMessage = (body.message ?? "").trim();

  const csv = jerseyReportToCsv(report);
  const csvFilename = `jersey-report-${ageGroup.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${seasonYear}.csv`;

  const textParts = [
    customMessage || null,
    customMessage ? "" : null,
    `Jersey report for ${ageGroup} (${seasonYear}).`,
    `Teams: ${report.teams.length}`,
    `Players: ${report.playerCount}`,
    report.missingNumberCount > 0 ? `Missing jersey number: ${report.missingNumberCount}` : null,
    report.missingSizeCount > 0 ? `Missing jersey size: ${report.missingSizeCount}` : null,
    admin?.email ? `Sent by: ${admin.email}` : null,
    "",
    "See the attached CSV or the table below for the full roster.",
  ].filter((line): line is string => line !== null);

  const html =
    (customMessage
      ? `<p style="font-family:system-ui,sans-serif;line-height:1.5">${customMessage.replace(/</g, "&lt;").replaceAll("\n", "<br/>")}</p>`
      : "") + jerseyReportToHtml(report);

  try {
    const result = await sendOrderReportEmail({
      actorAdminId: admin?.id ?? null,
      actorEmail: admin?.email ?? null,
      organizationId: targetOrg,
      campaignTitlePrefix: "Jersey Report",
      sourceType: "JERSEY_REPORT_MANUAL",
      recipients,
      subject,
      text: textParts.join("\n"),
      html,
      fromEmail: fromAddress,
      replyTo: admin?.email ?? null,
      attachments: [
        {
          filename: csvFilename,
          content: Buffer.from(csv, "utf8").toString("base64"),
          contentType: "text/csv; charset=utf-8",
        },
      ],
    });

    return NextResponse.json({
      ok: true,
      providerMessageId: result.providerMessageId,
      to: recipients,
      skippedSuppressed: result.skippedSuppressed,
      from: fromAddress,
      playerCount: report.playerCount,
      teamCount: report.teams.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email send failed" },
      { status: 502 },
    );
  }
}
