import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { getOrgId } from "@/lib/siteConfig";
import { getFallBallCapacityReport, type FallBallCapacityReport } from "@/lib/sportsConnect/fallballCapacity";
import { sendEmailViaResend } from "@/lib/communications/providers/resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOARD_RECIPIENT = "apboard@apbaseball.com";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.FALLBALL_REPORT_CRON_SECRET || process.env.CRON_SECRET;
  if (!cronSecret) return false; // fail closed — no silent open-auth fallback
  const authHeader = request.headers.get("authorization") || "";
  return safeCompare(authHeader, `Bearer ${cronSecret}`);
}

function statusBadge(status: FallBallCapacityReport["divisions"][number]["status"]) {
  switch (status) {
    case "DEFICIT":
      return { color: "#ef4444", bg: "#fef2f2", text: "Needs coaches" };
    case "NEAR_CAPACITY":
      return { color: "#f59e0b", bg: "#fffbeb", text: "Near capacity" };
    case "SURPLUS":
      return { color: "#10b981", bg: "#ecfdf5", text: "Surplus" };
    default:
      return { color: "#10b981", bg: "#ecfdf5", text: "Ideal" };
  }
}

function buildReportHtml(data: FallBallCapacityReport): string {
  const htmlRows = data.divisions
    .map((div) => {
      const badge = statusBadge(div.status);
      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px 16px; font-weight: 600; color: #1e293b;">${div.divisionName}</td>
          <td style="padding: 12px 16px; text-align: center; font-weight: 700; color: #0f172a;">${div.enrolledPlayers}</td>
          <td style="padding: 12px 16px; text-align: center; color: #64748b;">${div.teamCount}</td>
          <td style="padding: 12px 16px; text-align: center; font-weight: 700; color: #2563eb;">${div.matchedCoaches}</td>
          <td style="padding: 12px 16px; text-align: right;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; color: ${badge.color}; background-color: ${badge.bg}; border: 1px solid ${badge.color}33;">
              ${badge.text}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");

  const needsCoaches = data.divisions.filter((d) => d.status === "DEFICIT" || d.status === "NEAR_CAPACITY");
  const needsCoachesHtml =
    needsCoaches.length > 0
      ? `<li>Divisions needing coach recruitment: ${needsCoaches
          .map((d) => `<strong>${d.divisionName}</strong> (${d.matchedCoaches}/${d.teamCount} teams staffed)`)
          .join(", ")}.</li>`
      : `<li>All divisions with formed teams currently have at least one coach matched.</li>`;

  const reportDate = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const syncNote = data.lastPlayerRegSyncAt
    ? `Last SportsConnect enrollment file detected: ${new Date(data.lastPlayerRegSyncAt).toLocaleString("en-US")}${
        data.lastPlayerRegSyncFileName ? ` (${data.lastPlayerRegSyncFileName})` : ""
      }`
    : "No SportsConnect enrollment file has been synced yet — figures below reflect teams entered directly in Team Manager.";

  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>${data.seasonLabel} Daily Division Capacity Report</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <div style="max-width: 680px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <div style="background-color: #0f172a; padding: 28px 32px; color: #ffffff;">
            <div style="font-size: 12px; text-transform: uppercase; color: #10b981; font-weight: 700; margin-bottom: 6px;">
              Ascension Parish Baseball &bull; ${data.seasonLabel}
            </div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 800; line-height: 1.3;">
              Daily Division Enrollment &amp; Coaching Capacity Report
            </h1>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">Report Date: ${reportDate}</p>
          </div>

          <div style="padding: 32px;">
            <div style="display: flex; gap: 12px; margin-bottom: 28px;">
              <div style="flex: 1; background-color: #f1f5f9; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Enrolled Players</div>
                <div style="font-size: 24px; font-weight: 900; color: #059669; margin-top: 4px;">${data.totalPlayers}</div>
              </div>
              <div style="flex: 1; background-color: #f1f5f9; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Matched Coaches</div>
                <div style="font-size: 24px; font-weight: 900; color: #2563eb; margin-top: 4px;">${data.totalCoaches}</div>
              </div>
              <div style="flex: 1; background-color: #f1f5f9; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Teams Formed</div>
                <div style="font-size: 24px; font-weight: 900; color: #4f46e5; margin-top: 4px;">${data.totalTeams}</div>
              </div>
            </div>

            <div style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569;">
                  <tr>
                    <th style="padding: 10px 16px;">Division</th>
                    <th style="padding: 10px 16px; text-align: center;">Players</th>
                    <th style="padding: 10px 16px; text-align: center;">Teams</th>
                    <th style="padding: 10px 16px; text-align: center;">Coaches</th>
                    <th style="padding: 10px 16px; text-align: right;">Status</th>
                  </tr>
                </thead>
                <tbody>${htmlRows || `<tr><td colspan="5" style="padding: 16px; text-align: center; color: #64748b;">No teams have been entered for this season yet.</td></tr>`}</tbody>
              </table>
            </div>

            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; font-size: 13px; line-height: 1.5; color: #1e3a8a;">
              <strong>Summary:</strong>
              <ul style="margin: 6px 0 0 0; padding-left: 20px;">
                ${needsCoachesHtml}
              </ul>
            </div>

            <p style="margin-top: 16px; font-size: 11px; color: #94a3b8;">${syncNote}</p>

            <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; text-align: center; color: #94a3b8;">
              Sent automatically to <strong>${BOARD_RECIPIENT}</strong> via AP Baseball Admin Operations Hub.<br/>
              <a href="https://admin.apbaseball.com" style="color: #2563eb; text-decoration: underline;">Open Admin Desk</a>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function sendFallBallDailyReport() {
  const data = await getFallBallCapacityReport();
  const subject = `AP Baseball ${data.seasonLabel} — Daily Capacity Report (${data.totalPlayers} players, ${data.totalCoaches} coaches)`;

  const providerResponse = await sendEmailViaResend({
    to: BOARD_RECIPIENT,
    subject,
    html: buildReportHtml(data),
  });

  return { success: true, recipient: BOARD_RECIPIENT, providerResponse, report: data };
}

/**
 * GET — Vercel Cron trigger. vercel.json is identical across all 6 Vercel
 * projects sharing this repo, so this cron fires on all 6 independently;
 * only the fallball deployment (SITE_ORG=fallball) actually sends, so the
 * board doesn't get 6 duplicate emails every day.
 */
export async function GET(request: NextRequest) {
  if (getOrgId() !== "fallball") {
    return NextResponse.json({ ok: true, skipped: true, reason: "Not the fallball deployment" });
  }
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendFallBallDailyReport();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/fallball-daily-report GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send daily report" },
      { status: 500 },
    );
  }
}

/** POST — "Send Report to Board" button in AdminSportsConnectDesk. Admin-session gated. */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  try {
    const result = await sendFallBallDailyReport();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/fallball-daily-report POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send daily report" },
      { status: 500 },
    );
  }
}
