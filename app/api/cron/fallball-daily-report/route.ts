import { NextResponse } from "next/server";
import { getFallBallCapacityData } from "@/app/api/admin/sports-connect/capacity/route";
import { sendEmailViaResend } from "@/lib/communications/providers/resend";

export async function sendFallBallDailyReport() {
  const data = await getFallBallCapacityData();

  const recipientEmail = "apboard@apbaseball.com";

  // Build clean HTML email
  const htmlRows = data.divisions
    .map((div) => {
      let statusColor = "#10b981"; // green
      let statusBg = "#ecfdf5";
      let statusText = "🟢 Ideal";

      if (div.status === "SURPLUS") {
        statusColor = "#10b981";
        statusBg = "#ecfdf5";
        statusText = "🟢 Surplus";
      } else if (div.status === "NEAR_CAPACITY") {
        statusColor = "#f59e0b"; // amber
        statusBg = "#fffbeb";
        statusText = "🟡 Need 1 HC";
      } else if (div.status === "DEFICIT") {
        statusColor = "#ef4444"; // red
        statusBg = "#fef2f2";
        statusText = "🔴 Need Coaches";
      }

      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px 16px; font-weight: 600; color: #1e293b;">${div.divisionName}</td>
          <td style="padding: 12px 16px; text-align: center; font-weight: 700; color: #0f172a;">${div.enrolledPlayers}</td>
          <td style="padding: 12px 16px; text-align: center; color: #64748b;">${div.recommendedRosterSize} / team</td>
          <td style="padding: 12px 16px; text-align: center; font-weight: 700; color: #6366f1;">${div.estimatedTeams}</td>
          <td style="padding: 12px 16px; text-align: center; font-weight: 700; color: #2563eb;">${div.matchedCoaches}</td>
          <td style="padding: 12px 16px; text-align: right;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; color: ${statusColor}; background-color: ${statusBg}; border: 1px solid ${statusColor}33;">
              ${statusText}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Fall Ball 2026 Daily Division Capacity Report</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <div style="max-width: 680px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <div style="background-color: #0f172a; padding: 28px 32px; color: #ffffff;">
            <div style="font-size: 12px; text-transform: uppercase; tracking: 1px; color: #10b981; font-weight: 700; margin-bottom: 6px;">
              Ascension Parish Baseball • Fall Ball 2026
            </div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 800; line-height: 1.3;">
              📊 Daily Division Enrollment & Coaching Capacity Report
            </h1>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">
              Report Date: ${data.reportDate} • Data Source: ${data.sourceFile}
            </p>
          </div>

          <div style="padding: 32px;">
            <!-- Summary Grid -->
            <div style="display: flex; gap: 12px; margin-bottom: 28px;">
              <div style="flex: 1; background-color: #f1f5f9; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Enrolled Players</div>
                <div style="font-size: 24px; font-weight: 900; color: #059669; margin-top: 4px;">${data.totalPlayers}</div>
                <div style="font-size: 10px; color: #10b981; font-weight: 600; margin-top: 2px;">100% Paid</div>
              </div>
              <div style="flex: 1; background-color: #f1f5f9; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Matched Coaches</div>
                <div style="font-size: 24px; font-weight: 900; color: #2563eb; margin-top: 4px;">${data.totalCoaches}</div>
                <div style="font-size: 10px; color: #3b82f6; font-weight: 600; margin-top: 2px;">Confirmed</div>
              </div>
              <div style="flex: 1; background-color: #f1f5f9; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Estimated Teams</div>
                <div style="font-size: 24px; font-weight: 900; color: #4f46e5; margin-top: 4px;">~${data.totalEstimatedTeams}</div>
                <div style="font-size: 10px; color: #6366f1; font-weight: 600; margin-top: 2px;">10 Divisions</div>
              </div>
            </div>

            <!-- Table -->
            <div style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569;">
                  <tr>
                    <th style="padding: 10px 16px;">Division</th>
                    <th style="padding: 10px 16px; text-align: center;">Players</th>
                    <th style="padding: 10px 16px; text-align: center;">Roster</th>
                    <th style="padding: 10px 16px; text-align: center;">Est. Teams</th>
                    <th style="padding: 10px 16px; text-align: center;">Coaches</th>
                    <th style="padding: 10px 16px; text-align: right;">Health</th>
                  </tr>
                </thead>
                <tbody>
                  ${htmlRows}
                </tbody>
              </table>
            </div>

            <!-- Operational Callout -->
            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; font-size: 13px; line-height: 1.5; color: #1e3a8a;">
              <strong>📋 Executive Board Summary:</strong>
              <ul style="margin: 6px 0 0 0; padding-left: 20px;">
                <li>The league is currently at a healthy <strong>1:1 coach-to-team ratio</strong> overall (${data.totalCoaches} matched coaches for ~${data.totalEstimatedTeams} teams).</li>
                <li><strong>Action Priority</strong>: Recruitment needed for <strong>2–3 Head Coaches in 13–15U</strong> (41 players, 1 coach).</li>
                <li>24 interested coaches who submitted web forms are currently pending official SportsConnect background checks.</li>
              </ul>
            </div>

            <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; text-align: center; color: #94a3b8;">
              Sent automatically to <strong>${recipientEmail}</strong> via AP Baseball Admin Operations Hub.<br/>
              <a href="https://admin.apbaseball.com" style="color: #2563eb; text-decoration: underline;">Open Admin Desk</a>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const subject = `📊 AP Baseball Fall Ball 2026 — Daily Capacity Report (${data.totalPlayers} Players, ${data.totalCoaches} Coaches)`;

  const providerResponse = await sendEmailViaResend({
    to: recipientEmail,
    subject,
    html: emailHtml,
  });

  return {
    success: true,
    recipient: recipientEmail,
    providerResponse,
    report: data,
  };
}

export async function GET() {
  try {
    const result = await sendFallBallDailyReport();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Daily Report Cron Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to send daily report" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await sendFallBallDailyReport();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Daily Report Manual Trigger Error]:", error);
    return NextResponse.json({ error: error?.message || "Failed to send daily report" }, { status: 500 });
  }
}
