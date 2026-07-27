import type { TripAnswers } from "@/lib/trip/types";
import { parseAnswersJson } from "@/lib/trip/validate";

export type RosterOrg = {
  name: string;
  shortName: string;
  logoPath: string;
  logoAbsoluteUrl?: string | null;
};

export type RosterEvent = {
  name: string;
  teamLabel: string | null;
};

export type RosterParticipant = {
  playerFullName: string;
  jerseyNumber: string | null;
  status: string;
  answersJson: string | null;
};

export type RosterCoach = {
  name: string;
  role: string; // "Head Coach" | "Assistant Coach"
};

export type ResolvedRosterPlayer = {
  jerseyNumber: string;
  playerName: string;
};

/** Hardcoded coaches for the Ascension LL SW Regionals trip */
export const DEFAULT_SW_REGIONALS_COACHES: RosterCoach[] = [
  { name: "Kyle Suire", role: "Head Coach" },
  { name: "Brett Durand", role: "Assistant Coach" },
  { name: "Travis Drago", role: "Assistant Coach" },
];

/** Coach names that must never appear in the Players section of the roster (case-insensitive). */
const COACH_NAMES_TO_EXCLUDE = new Set(
  DEFAULT_SW_REGIONALS_COACHES.map((c) => c.name.toLowerCase().trim()),
);

function isCoachName(name: string): boolean {
  const t = (name || "").toLowerCase().trim();
  return COACH_NAMES_TO_EXCLUDE.has(t);
}

function str(answers: TripAnswers, key: string): string {
  const v = answers[key];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayOrDash(value: string): string {
  return value.trim() ? value.trim() : "—";
}

function resolvePlayerForRoster(p: RosterParticipant): ResolvedRosterPlayer {
  const a = parseAnswersJson(p.answersJson);
  const first = str(a, "first_name");
  const last = str(a, "last_name");
  const playerName =
    [first, last].filter(Boolean).join(" ") || p.playerFullName;

  const jersey =
    str(a, "uniform_number") || p.jerseyNumber?.trim() || "";

  return {
    jerseyNumber: jersey,
    playerName,
  };
}

/**
 * Roster only shows athletes in the Players table.
 * Coaches, managers, and other staff are listed in the Coaching Staff section
 * (hardcoded for this trip) and must not appear as player rows.
 */
function isAthlete(p: Pick<RosterParticipant, "answersJson">): boolean {
  const a = parseAnswersJson(p.answersJson);
  const type = str(a, "participant_type").toLowerCase().trim();
  // Empty / missing / "player" => athlete. Everything else (Coach, Manager, etc.) is excluded.
  if (!type || type === "player") return true;
  return false;
}

function filterAthletes<T extends Pick<RosterParticipant, "answersJson">>(ps: T[]): T[] {
  return ps.filter(isAthlete);
}

/**
 * After resolving, drop any row whose name matches a known coach.
 * This catches cases where a coach was added as a trip participant
 * (with placeholder jersey like "NA" or "—") before participant_type was set.
 */
function filterOutCoachNames(players: ResolvedRosterPlayer[]): ResolvedRosterPlayer[] {
  return players.filter((p) => !isCoachName(p.playerName));
}

/** Drop rows that have no usable jersey number (NA, —, -, empty, etc.). */
function hasMeaningfulJersey(p: ResolvedRosterPlayer): boolean {
  const j = (p.jerseyNumber || "").trim().toUpperCase();
  if (!j) return false;
  if (j === "NA" || j === "N/A" || j === "-" || j === "—") return false;
  return true;
}

function filterMeaningfulPlayers(players: ResolvedRosterPlayer[]): ResolvedRosterPlayer[] {
  return players.filter(hasMeaningfulJersey);
}

/** Build a clean printable roster (jersey + name for players, plus coaches). */
export function buildRosterHtml(input: {
  org: RosterOrg;
  event: RosterEvent;
  participants: RosterParticipant[];
  coaches?: RosterCoach[];
  generatedAt?: Date;
}): string {
  const generated = (input.generatedAt ?? new Date()).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const logo = input.org.logoAbsoluteUrl || input.org.logoPath;
  const teamLine = [input.event.teamLabel, input.event.name]
    .filter(Boolean)
    .join(" · ");

  const resolvedCoaches = input.coaches && input.coaches.length > 0
    ? input.coaches
    : DEFAULT_SW_REGIONALS_COACHES;

  // Build player list from athletes only (coaches/staff are in the Coaching Staff section above).
  // 1) participant_type filter, 2) sort, 3) name filter (coaches), 4) jersey filter (drop NA / — / empty placeholders).
  let players: ResolvedRosterPlayer[] = filterAthletes(input.participants ?? [])
    .map((p: RosterParticipant) => resolvePlayerForRoster(p))
    .sort((a: ResolvedRosterPlayer, b: ResolvedRosterPlayer) => {
      const aj = parseInt(a.jerseyNumber, 10);
      const bj = parseInt(b.jerseyNumber, 10);
      const aNum = Number.isFinite(aj) ? aj : 9999;
      const bNum = Number.isFinite(bj) ? bj : 9999;
      if (aNum !== bNum) return aNum - bNum;
      return a.playerName.localeCompare(b.playerName);
    });
  players = filterOutCoachNames(players);
  players = filterMeaningfulPlayers(players);

  const playerRows = players
    .map((p) => {
      const j = displayOrDash(p.jerseyNumber);
      return `
        <tr>
          <td class="jersey">#${escapeHtml(j)}</td>
          <td class="name">${escapeHtml(p.playerName)}</td>
        </tr>`;
    })
    .join("\n");

  const coachRows = resolvedCoaches
    .map((c) => {
      return `
        <div class="coach-row">
          <span class="coach-name">${escapeHtml(c.name)}</span>
          <span class="coach-role">${escapeHtml(c.role)}</span>
        </div>`;
    })
    .join("\n");

  const playerCount = players.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Roster — ${escapeHtml(input.event.name)}</title>
  <style>
    @page { size: letter portrait; margin: 0.6in; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      color: #111;
      font-size: 12pt;
      line-height: 1.35;
      margin: 0;
      background: #fff;
    }
    .toolbar {
      position: sticky; top: 0; z-index: 10;
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      padding: 10px 14px; background: #1a1a1a; color: #f5f5f5;
      font-size: 13px;
    }
    .toolbar button, .toolbar a {
      background: #f5c518; color: #111; border: 0; border-radius: 6px;
      padding: 6px 12px; font-weight: 600; cursor: pointer; text-decoration: none;
      font-size: 13px;
    }
    .toolbar .muted { color: #aaa; margin-left: auto; }
    @media print { .toolbar { display: none !important; } body { background: #fff; } }

    .page {
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.1in 0.15in;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 14px;
      border-bottom: 3px solid #111;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .logo { width: 54px; height: 54px; object-fit: contain; }
    .title-block h1 {
      margin: 0;
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    .title-block .org {
      margin: 0;
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #444;
      font-weight: 600;
    }
    .title-block .event {
      margin: 2px 0 0;
      font-size: 11pt;
      color: #333;
    }

    .section {
      margin: 16px 0 10px;
    }
    .section h2 {
      margin: 0 0 6px;
      font-size: 11pt;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border-bottom: 1px solid #ccc;
      padding-bottom: 3px;
      font-weight: 700;
    }

    .coaches {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      margin-bottom: 4px;
    }
    .coach-row {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      font-size: 11.5pt;
    }
    .coach-name { font-weight: 700; }
    .coach-role {
      font-size: 10pt;
      color: #444;
      font-weight: 600;
    }

    table.roster {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
    }
    table.roster th {
      text-align: left;
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #444;
      border-bottom: 2px solid #111;
      padding: 6px 8px 4px;
      font-weight: 700;
    }
    table.roster td {
      padding: 5px 8px;
      border-bottom: 1px solid #ddd;
      font-size: 12pt;
      vertical-align: middle;
    }
    table.roster tr:last-child td { border-bottom: 0; }
    table.roster .jersey {
      width: 68px;
      font-weight: 800;
      font-size: 13pt;
      letter-spacing: 0.02em;
    }
    table.roster .name {
      font-weight: 600;
    }

    .meta {
      margin-top: 14px;
      font-size: 9.5pt;
      color: #555;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px solid #ddd;
      padding-top: 8px;
    }
    .meta .count { font-weight: 700; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Print</button>
    <span>${escapeHtml(input.org.shortName)} · ${escapeHtml(input.event.name)}</span>
    <span class="muted">${players.length} player(s)</span>
  </div>

  <div class="page">
    <div class="header">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="" class="logo"/>` : ""}
      <div class="title-block">
        <p class="org">${escapeHtml(input.org.name)}</p>
        <h1>Travel Roster</h1>
        <p class="event">${escapeHtml(teamLine)}</p>
      </div>
    </div>

    <div class="section">
      <h2>Coaching Staff</h2>
      <div class="coaches">
        ${coachRows || "<em>No coaches listed</em>"}
      </div>
    </div>

    <div class="section">
      <h2>Players</h2>
      ${
        players.length > 0
          ? `<table class="roster">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                </tr>
              </thead>
              <tbody>
                ${playerRows}
              </tbody>
            </table>`
          : `<p style="color:#555; font-style:italic;">No players on roster yet.</p>`
      }
    </div>

    <div class="meta">
      <span class="count">${playerCount} player(s)</span>
      <span>${escapeHtml(generated)}</span>
    </div>
  </div>
</body>
</html>`;
}

/** Build a compact single-page PDF roster. */
export async function buildRosterPdf(input: {
  org: RosterOrg;
  event: RosterEvent;
  participants: RosterParticipant[];
  coaches?: RosterCoach[];
}): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 42;
  const contentW = pageW - margin * 2;

  const generated = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  let logoDataUrl: string | null = null;
  if (input.org.logoAbsoluteUrl) {
    try {
      const res = await fetch(input.org.logoAbsoluteUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") || "image/png";
        logoDataUrl = `data:${ct};base64,${buf.toString("base64")}`;
      }
    } catch {
      logoDataUrl = null;
    }
  }

  const teamLine = [input.event.teamLabel, input.event.name]
    .filter(Boolean)
    .join(" · ");

  const resolvedCoachesPdf = input.coaches && input.coaches.length > 0
    ? input.coaches
    : DEFAULT_SW_REGIONALS_COACHES;

  // Athletes only in the PLAYERS section (coaches are shown above in COACHING STAFF).
  // 1) type filter, 2) sort, 3) name filter, 4) jersey filter (drop NA/—/empty).
  let players: ResolvedRosterPlayer[] = filterAthletes(input.participants ?? [])
    .map((p: RosterParticipant) => resolvePlayerForRoster(p))
    .sort((a: ResolvedRosterPlayer, b: ResolvedRosterPlayer) => {
      const aj = parseInt(a.jerseyNumber, 10);
      const bj = parseInt(b.jerseyNumber, 10);
      const aNum = Number.isFinite(aj) ? aj : 9999;
      const bNum = Number.isFinite(bj) ? bj : 9999;
      if (aNum !== bNum) return aNum - bNum;
      return a.playerName.localeCompare(b.playerName);
    });
  players = filterOutCoachNames(players);
  players = filterMeaningfulPlayers(players);

  let y = margin;

  // Header / logo
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, y, 38, 38);
    } catch {
      /* ignore */
    }
  }
  const textX = logoDataUrl ? margin + 46 : margin;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(input.org.name.toUpperCase(), textX, y + 11);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text("Travel Roster", textX, y + 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(teamLine, textX, y + 40);

  y += 54;
  doc.setDrawColor(0);
  doc.setLineWidth(1.4);
  doc.line(margin, y, pageW - margin, y);
  y += 16;

  // Coaches
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("COACHING STAFF", margin, y);
  y += 4;
  doc.setDrawColor(170);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  resolvedCoachesPdf.forEach((c) => {
    doc.setFont("helvetica", "bold");
    doc.text(c.name, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text(c.role, margin + 160, y);
    doc.setTextColor(0);
    y += 15;
  });

  y += 6;
  doc.setDrawColor(0);
  doc.setLineWidth(1);
  doc.line(margin, y, pageW - margin, y);
  y += 14;

  // Players header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("PLAYERS", margin, y);
  y += 4;
  doc.setDrawColor(170);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 16;

  // Table header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("#", margin, y);
  doc.text("Name", margin + 48, y);
  y += 3;
  doc.setDrawColor(0);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 14;

  // Rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  players.forEach((p) => {
    const j = displayOrDash(p.jerseyNumber);
    doc.setFont("helvetica", "bold");
    doc.text(`#${j}`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(p.playerName || "—", margin + 48, y);
    y += 15;

    if (y > 680) {
      // simple overflow guard; start new page if needed
      doc.addPage();
      y = margin + 20;
    }
  });

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 28;
  doc.setDrawColor(0);
  doc.setLineWidth(0.8);
  doc.line(margin, footerY - 12, pageW - margin, footerY - 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(`${players.length} player(s)`, margin, footerY);
  doc.text(generated, pageW - margin, footerY, { align: "right" });

  const arrayBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}
