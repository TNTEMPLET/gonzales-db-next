import { dateKey } from "@/lib/scheduler/validation";

export const COACH_NOTIFY_SOURCE_TYPE = "SCHEDULER_COACH_NOTIFY";

export const NOTIFY_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const NOTIFY_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type CoachNotifyStatus = "ready" | "no_head_coach" | "no_email" | "suppressed";

export type CoachNotifyGameLine = {
  date: string;
  startTime: string;
  opponent: string;
  parkName: string;
  fieldName: string;
  location: string;
  home: boolean;
  text: string;
};

export type CoachNotifyPracticeLine = {
  day: string;
  startTime: string;
  parkName: string;
  fieldName: string;
  pairedTeamName: string;
  notes: string;
  text: string;
};

export type CoachNotifyPreviewRow = {
  teamId: string;
  teamName: string;
  ageGroup: string;
  coachName: string | null;
  coachEmail: string | null;
  registeredUserId: string | null;
  practiceCount: number;
  practiceSummary: string;
  practicePlan: string;
  practices: CoachNotifyPracticeLine[];
  gameCount: number;
  games: CoachNotifyGameLine[];
  seasonName: string;
  orgName: string;
  practiceWindow: string;
  gamesWindow: string;
  status: CoachNotifyStatus;
  statusLabel: string;
  subject: string;
  text: string;
  html: string;
};

export type CoachNotifySummary = {
  teamCount: number;
  readyCount: number;
  missingCoachCount: number;
  missingEmailCount: number;
  suppressedCount: number;
  practiceCount: number;
  gameCount: number;
  lastSentAt: string | null;
  lastSentCount: number;
  lastCampaignId: string | null;
  canSend: boolean;
  sendBlockedReason: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatNotifyClock(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${((hours + 11) % 12) + 1}:${minutes} ${suffix}`;
}

export function formatNotifyDate(value: Date | string | null | undefined): string {
  const key = value instanceof Date ? dateKey(value) : typeof value === "string" ? value.slice(0, 10) : "";
  if (!key) return "";
  const [, month, day] = key.split("-");
  const year = key.slice(0, 4);
  if (!month || !day) return key;
  return `${Number(month)}/${Number(day)}/${year}`;
}

export function coachDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
} | null): string | null {
  if (!user) return null;
  const parts = [user.firstName, user.lastName].map((part) => part?.trim()).filter(Boolean);
  if (parts.length) return parts.join(" ");
  return user.name?.trim() || null;
}

export function formatNotifyGameLine(input: {
  gameDate: Date | string | null;
  startTime: string | null;
  opponent: string;
  parkName: string | null;
  fieldName: string | null;
  home: boolean;
}): CoachNotifyGameLine {
  const date = formatNotifyDate(input.gameDate);
  const startTime = formatNotifyClock(input.startTime);
  const parkName = input.parkName?.trim() || "";
  const fieldName = input.fieldName?.trim() || "";
  const location = [parkName, fieldName].filter(Boolean).join(" · ") || "Location TBD";
  const when = [date, startTime].filter(Boolean).join(" · ");
  const text = `${when} · vs ${input.opponent} · ${location} · ${input.home ? "Home" : "Away"}`;
  return {
    date,
    startTime,
    opponent: input.opponent,
    parkName,
    fieldName,
    location,
    home: input.home,
    text,
  };
}

export function formatNotifyPracticeLine(input: {
  dayOfWeek: number;
  startTime: string;
  parkName: string | null;
  fieldName: string | null;
  pairedTeamName: string | null;
  notes: string | null;
}): CoachNotifyPracticeLine {
  const day = NOTIFY_DAY_NAMES[input.dayOfWeek] ?? "";
  const startTime = formatNotifyClock(input.startTime);
  const parkName = input.parkName?.trim() || "";
  const fieldName = input.fieldName?.trim() || "";
  const pairedTeamName = input.pairedTeamName?.trim() || "";
  const notes = input.notes?.trim() || "";
  const location = [fieldName, parkName].filter(Boolean).join(", ") || "Location TBD";
  let text = `${day}s ${startTime} — ${location}`;
  if (pairedTeamName) text += ` (shares with ${pairedTeamName})`;
  if (notes) text += ` — ${notes}`;
  return { day, startTime, parkName, fieldName, pairedTeamName, notes, text };
}

export function coachNotifyStatus(input: {
  coachEmail: string | null;
  registeredUserId: string | null;
  suppressed?: boolean;
}): CoachNotifyStatus {
  if (!input.registeredUserId) return "no_head_coach";
  if (!input.coachEmail) return "no_email";
  if (input.suppressed) return "suppressed";
  return "ready";
}

export function coachNotifyStatusLabel(status: CoachNotifyStatus): string {
  if (status === "ready") return "Ready";
  if (status === "no_head_coach") return "No head coach";
  if (status === "no_email") return "No email";
  return "Suppressed";
}

export function parseCoachNotifyState(settings: unknown): {
  lastSentAt: string | null;
  lastSentCount: number;
  lastCampaignId: string | null;
} {
  if (!settings || typeof settings !== "object") {
    return { lastSentAt: null, lastSentCount: 0, lastCampaignId: null };
  }
  const record = settings as Record<string, unknown>;
  const lastSentAt = typeof record.coachNotifySentAt === "string" ? record.coachNotifySentAt : null;
  const lastSentCount =
    typeof record.coachNotifySentCount === "number" && Number.isFinite(record.coachNotifySentCount)
      ? record.coachNotifySentCount
      : 0;
  const lastCampaignId = typeof record.coachNotifyCampaignId === "string" ? record.coachNotifyCampaignId : null;
  return { lastSentAt, lastSentCount, lastCampaignId };
}

export function withCoachNotifyState(
  existing: unknown,
  state: { lastSentAt: string; lastSentCount: number; lastCampaignId: string },
): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {};
  return {
    ...base,
    coachNotifySentAt: state.lastSentAt,
    coachNotifySentCount: state.lastSentCount,
    coachNotifyCampaignId: state.lastCampaignId,
  };
}

function emailTable(headers: string[], rows: string[][], emptyMessage: string): string {
  const th = headers
    .map(
      (header) =>
        `<th align="left" style="background:#cc0000;color:#ffffff;font-size:12px;font-weight:600;padding:8px 10px;text-align:left">${escapeHtml(header)}</th>`,
    )
    .join("");
  const body = rows.length
    ? rows
        .map((row, index) => {
          const bg = index % 2 === 1 ? "#f4f4f5" : "#ffffff";
          const cells = row
            .map(
              (cell) =>
                `<td style="border-top:1px solid #e4e4e7;font-size:13px;padding:8px 10px;color:#111827">${escapeHtml(cell || "—")}</td>`,
            )
            .join("");
          return `<tr style="background:${bg}">${cells}</tr>`;
        })
        .join("")
    : `<tr><td colspan="${headers.length}" style="font-size:13px;padding:8px 10px;color:#52525b">${escapeHtml(emptyMessage)}</td></tr>`;
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border:1px solid #e4e4e7;margin:0 0 20px">
      <thead><tr>${th}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

export function buildCoachScheduleEmail(input: {
  coachName: string | null;
  orgName: string;
  seasonName: string;
  ageGroup: string;
  teamName: string;
  practicePlan: string;
  practices?: CoachNotifyPracticeLine[];
  games: CoachNotifyGameLine[];
  practiceWindow: string;
  gamesWindow: string;
  coachCornerUrl: string;
}): { subject: string; text: string; html: string } {
  const greeting = input.coachName ? `Hi ${input.coachName.split(" ")[0]},` : "Hi Coach,";
  const subject = `${input.ageGroup} ${input.teamName} — ${input.seasonName} schedule`;
  const practiceBlock = input.practicePlan.trim() || "No practice slot assigned yet.";
  const gameLines = input.games.length
    ? input.games.map((game) => `• ${game.text}`).join("\n")
    : "No placed games in the draft yet.";
  const text = [
    greeting,
    "",
    `Here is the ${input.seasonName} schedule for ${input.ageGroup} ${input.teamName}.`,
    "",
    `Practice${input.practiceWindow ? ` (${input.practiceWindow})` : ""}`,
    practiceBlock,
    "",
    `Games${input.gamesWindow ? ` (${input.gamesWindow})` : ""}`,
    gameLines,
    "",
    "A PDF of this schedule is attached.",
    input.coachCornerUrl ? `Coach Corner: ${input.coachCornerUrl}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const practiceRows = (input.practices ?? []).map((slot) => [
    slot.day,
    slot.startTime,
    slot.parkName || "—",
    slot.fieldName || "—",
    slot.pairedTeamName || "—",
    slot.notes || "—",
  ]);
  const gameRows = input.games.map((game) => [
    game.date,
    game.startTime,
    game.opponent,
    game.home ? "Home" : "Away",
    game.parkName || "—",
    game.fieldName || "—",
  ]);

  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111827">
      <p>${escapeHtml(greeting)}</p>
      <p>Here is the <strong>${escapeHtml(input.seasonName)}</strong> schedule for <strong>${escapeHtml(input.ageGroup)} ${escapeHtml(input.teamName)}</strong>.</p>
      <h3 style="margin:16px 0 8px;font-size:16px">Practice${input.practiceWindow ? ` (${escapeHtml(input.practiceWindow)})` : ""}</h3>
      ${emailTable(
        ["Day", "Start", "Park", "Field", "Pair", "Notes"],
        practiceRows,
        "No practice slot assigned yet.",
      )}
      <h3 style="margin:16px 0 8px;font-size:16px">Games${input.gamesWindow ? ` (${escapeHtml(input.gamesWindow)})` : ""}</h3>
      ${emailTable(
        ["Date", "Start", "Opponent", "Home/Away", "Park", "Field"],
        gameRows,
        "No placed games in the draft yet.",
      )}
      <p style="font-size:13px;color:#4b5563">A PDF of this schedule is attached.</p>
      ${
        input.coachCornerUrl
          ? `<p><a href="${escapeHtml(input.coachCornerUrl)}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open Coach Corner</a></p>`
          : ""
      }
    </div>
  `;

  return { subject, text, html };
}
