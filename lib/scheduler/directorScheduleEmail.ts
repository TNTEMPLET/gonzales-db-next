import { fieldNumberFromName } from "@/lib/scheduler/teeballMascot";
import {
  formatNotifyDate,
  NOTIFY_DAY_NAMES,
  sortNotifyAgeGroups,
} from "@/lib/scheduler/coachScheduleEmail";
import { dateKey } from "@/lib/scheduler/validation";

export const DIRECTOR_NOTIFY_SOURCE_TYPE = "SCHEDULER_DIRECTOR_NOTIFY";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export type DirectorScheduleGame = {
  parkId: string | null;
  parkName: string;
  fieldId: string | null;
  fieldName: string;
  division: string;
  date: string;
  startTime: string;
  homeTeamName: string;
  awayTeamName: string;
};

export type DirectorParkOption = {
  parkId: string;
  parkName: string;
  gameCount: number;
};

export type DirectorDayGroup = {
  date: string;
  dateLabel: string;
  rows: DirectorScheduleGame[];
};

export type DirectorParkGroup = {
  parkId: string;
  parkName: string;
  gameCount: number;
  days: DirectorDayGroup[];
};

export type DirectorNotifyPayload = {
  parks: DirectorParkOption[];
  games: DirectorScheduleGame[];
  gameCount: number;
  lastSentAt: string | null;
  lastSentCount: number;
  lastCampaignId: string | null;
  seasonName: string;
  orgName: string;
  gamesWindow: string;
};

export function parseDirectorEmails(value: string): { emails: string[]; skipped: number } {
  const tokens = value
    .split(/[,;\s]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const emails: string[] = [];
  let skipped = 0;
  for (const token of tokens) {
    if (!EMAIL_RE.test(token)) {
      skipped += 1;
      continue;
    }
    if (seen.has(token)) continue;
    seen.add(token);
    emails.push(token);
  }
  return { emails, skipped };
}

export function compareFieldNames(a: string, b: string): number {
  const numA = fieldNumberFromName(a);
  const numB = fieldNumberFromName(b);
  if (numA != null && numB != null && numA !== numB) return numA - numB;
  if (numA != null && numB == null) return -1;
  if (numA == null && numB != null) return 1;
  return a.localeCompare(b);
}

export function compareDirectorDivisions(a: string, b: string): number {
  const [left] = sortNotifyAgeGroups([a, b]);
  if (left === a && a !== b) return -1;
  if (left === b && a !== b) return 1;
  return a.localeCompare(b);
}

export function compareDirectorGames(a: DirectorScheduleGame, b: DirectorScheduleGame): number {
  return (
    a.parkName.localeCompare(b.parkName) ||
    a.date.localeCompare(b.date) ||
    compareFieldNames(a.fieldName, b.fieldName) ||
    compareDirectorDivisions(a.division, b.division) ||
    a.startTime.localeCompare(b.startTime) ||
    a.homeTeamName.localeCompare(b.homeTeamName)
  );
}

export function sortDirectorGames(games: DirectorScheduleGame[]): DirectorScheduleGame[] {
  return [...games].sort(compareDirectorGames);
}

export function parkKey(parkId: string | null | undefined): string {
  return parkId?.trim() || "";
}

export function filterDirectorGames(
  games: DirectorScheduleGame[],
  parkIds: string[] | null | undefined,
): DirectorScheduleGame[] {
  if (!parkIds) return sortDirectorGames(games);
  const wanted = new Set(parkIds);
  return sortDirectorGames(games.filter((game) => wanted.has(parkKey(game.parkId))));
}

export function directorParksFromGames(games: DirectorScheduleGame[]): DirectorParkOption[] {
  const found = new Map<string, DirectorParkOption>();
  for (const game of games) {
    const id = parkKey(game.parkId);
    const current = found.get(id) ?? { parkId: id, parkName: game.parkName || "Park TBD", gameCount: 0 };
    current.gameCount += 1;
    if (!current.parkName || current.parkName === "Park TBD") current.parkName = game.parkName || "Park TBD";
    found.set(id, current);
  }
  return [...found.values()].sort((a, b) => a.parkName.localeCompare(b.parkName));
}

export function weekdayFromDateKey(key: string): string {
  const day = new Date(`${key}T00:00:00.000Z`).getUTCDay();
  return Number.isFinite(day) ? (NOTIFY_DAY_NAMES[day] ?? "") : "";
}

export function directorDateLabel(date: string): string {
  const weekday = weekdayFromDateKey(date);
  const pretty = formatNotifyDate(date);
  return [weekday, pretty].filter(Boolean).join(", ");
}

export function groupDirectorGames(games: DirectorScheduleGame[]): DirectorParkGroup[] {
  const sorted = sortDirectorGames(games);
  const parks: DirectorParkGroup[] = [];
  for (const game of sorted) {
    const id = parkKey(game.parkId);
    let park = parks.find((item) => item.parkId === id);
    if (!park) {
      park = { parkId: id, parkName: game.parkName || "Park TBD", gameCount: 0, days: [] };
      parks.push(park);
    }
    let day = park.days.find((item) => item.date === game.date);
    if (!day) {
      day = { date: game.date, dateLabel: directorDateLabel(game.date), rows: [] };
      park.days.push(day);
    }
    day.rows.push(game);
    park.gameCount += 1;
  }
  return parks;
}

export function parseDirectorNotifyState(settings: unknown): {
  lastSentAt: string | null;
  lastSentCount: number;
  lastCampaignId: string | null;
} {
  if (!settings || typeof settings !== "object") {
    return { lastSentAt: null, lastSentCount: 0, lastCampaignId: null };
  }
  const record = settings as Record<string, unknown>;
  const lastSentAt = typeof record.directorNotifySentAt === "string" ? record.directorNotifySentAt : null;
  const lastSentCount =
    typeof record.directorNotifySentCount === "number" && Number.isFinite(record.directorNotifySentCount)
      ? record.directorNotifySentCount
      : 0;
  const lastCampaignId = typeof record.directorNotifyCampaignId === "string" ? record.directorNotifyCampaignId : null;
  return { lastSentAt, lastSentCount, lastCampaignId };
}

export function withDirectorNotifyState(
  existing: unknown,
  state: { lastSentAt: string; lastSentCount: number; lastCampaignId: string },
): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {};
  return {
    ...base,
    directorNotifySentAt: state.lastSentAt,
    directorNotifySentCount: state.lastSentCount,
    directorNotifyCampaignId: state.lastCampaignId,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildDirectorScheduleEmail(input: {
  orgName: string;
  seasonName: string;
  games: DirectorScheduleGame[];
  gamesWindow?: string;
}): { subject: string; text: string; html: string } {
  const groups = groupDirectorGames(input.games);
  const parkNames = groups.map((park) => park.parkName);
  const parkPart = parkNames.length === 1 ? parkNames[0] : parkNames.length ? `${parkNames.length} parks` : "all parks";
  const subject = `${input.seasonName} director schedule — ${parkPart}`;
  const windowLabel = input.gamesWindow ? ` (${input.gamesWindow})` : "";
  const gameCount = input.games.length;
  const parkLines = groups.map((park) => `${park.parkName} — ${park.gameCount} game${park.gameCount === 1 ? "" : "s"}`);

  const text = [
    "Hi,",
    "",
    gameCount
      ? `The ${input.seasonName} director schedule for ${parkPart} is attached as a PDF.`
      : "No placed games in the selected parks.",
    input.gamesWindow ? `Games${windowLabel}` : null,
    ...parkLines.map((line) => `• ${line}`),
    "",
    gameCount ? "Open the PDF for the board grouped by park, day, and field." : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const parkList = parkLines.length
    ? `<ul style="padding-left:20px;margin:12px 0">${parkLines
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("")}</ul>`
    : "";

  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111827">
      <p>Hi,</p>
      <p>${
        gameCount
          ? `The <strong>${escapeHtml(input.seasonName)}</strong> director schedule for <strong>${escapeHtml(parkPart)}</strong> is attached as a PDF.`
          : "No placed games in the selected parks."
      }</p>
      ${input.gamesWindow ? `<p style="font-size:13px;color:#4b5563">Games${escapeHtml(windowLabel)}</p>` : ""}
      ${parkList}
      ${gameCount ? `<p>Open the PDF for the board grouped by park, day, and field.</p>` : ""}
    </div>
  `;

  return { subject, text, html };
}

export function toDirectorScheduleGame(input: {
  parkId: string | null;
  parkName: string | null;
  fieldId: string | null;
  fieldName: string | null;
  division: string;
  ageGroup?: string | null;
  gameDate: Date | string | null;
  startTime: string | null;
  homeTeamName: string;
  awayTeamName: string;
}): DirectorScheduleGame {
  const date = input.gameDate instanceof Date ? dateKey(input.gameDate) : typeof input.gameDate === "string" ? input.gameDate.slice(0, 10) : "";
  return {
    parkId: input.parkId,
    parkName: input.parkName?.trim() || "Park TBD",
    fieldId: input.fieldId,
    fieldName: input.fieldName?.trim() || "Field TBD",
    division: (input.ageGroup || input.division).trim() || input.division,
    date,
    startTime: input.startTime?.trim() || "",
    homeTeamName: input.homeTeamName,
    awayTeamName: input.awayTeamName,
  };
}
