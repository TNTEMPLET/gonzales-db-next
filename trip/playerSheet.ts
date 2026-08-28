import type { TripAnswers } from "@/lib/trip/types";
import { parseAnswersJson } from "@/lib/trip/validate";

export type PlayerSheetOrg = {
  name: string;
  shortName: string;
  logoPath: string;
  /** Absolute URL for logo when rendering server HTML/PDF */
  logoAbsoluteUrl?: string | null;
};

export type PlayerSheetEvent = {
  name: string;
  teamLabel: string | null;
};

export type PlayerSheetParticipant = {
  playerFullName: string;
  ageGroup: string | null;
  team: string | null;
  jerseyNumber: string | null;
  status: string;
  answersJson: string | null;
};

function str(answers: TripAnswers, key: string): string {
  const v = answers[key];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function displayOrDash(value: string): string {
  return value.trim() ? value.trim() : "—";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function multilineHtml(value: string): string {
  const t = value.trim();
  if (!t) return "—";
  return escapeHtml(t).replace(/\n/g, "<br/>");
}

export type ResolvedPlayerSheet = {
  playerName: string;
  uniformNumber: string;
  ageGroup: string;
  team: string;
  positions: string;
  bats: string;
  throws: string;
  participantType: string;
  guardian1Name: string;
  guardian1Email: string;
  guardian1Phone: string;
  guardian2Name: string;
  guardian2Email: string;
  guardian2Phone: string;
  allergies: string;
  sleep: string;
  anxiety: string;
  medications: string;
  otherConcerns: string;
  formStatus: string;
};

export function resolvePlayerSheetData(
  participant: PlayerSheetParticipant,
): ResolvedPlayerSheet {
  const a = parseAnswersJson(participant.answersJson);
  const first = str(a, "first_name");
  const last = str(a, "last_name");
  const playerName =
    [first, last].filter(Boolean).join(" ") || participant.playerFullName;

  const g1 = [str(a, "guardian1_first_name"), str(a, "guardian1_last_name")]
    .filter(Boolean)
    .join(" ");
  const g2 = [str(a, "guardian2_first_name"), str(a, "guardian2_last_name")]
    .filter(Boolean)
    .join(" ");

  return {
    playerName,
    uniformNumber:
      str(a, "uniform_number") || participant.jerseyNumber?.trim() || "",
    ageGroup: participant.ageGroup?.trim() || "",
    team: participant.team?.trim() || "",
    positions: str(a, "positions"),
    bats: str(a, "bats"),
    throws: str(a, "throws"),
    participantType: str(a, "participant_type") || "Player",
    guardian1Name: g1,
    guardian1Email: str(a, "guardian1_email"),
    guardian1Phone: str(a, "guardian1_phone"),
    guardian2Name: g2,
    guardian2Email: str(a, "guardian2_email"),
    guardian2Phone: str(a, "guardian2_phone"),
    allergies: str(a, "health_allergies"),
    sleep: str(a, "health_sleep"),
    anxiety: str(a, "health_anxiety"),
    medications: str(a, "health_medications"),
    otherConcerns: str(a, "health_other"),
    formStatus: participant.status,
  };
}

/**
 * Player sheets / cards are for athletes only.
 * Coaches, managers, and other staff go on the director spreadsheet — not binder cards.
 */
export function isPlayerSheetEligible(
  participant: Pick<PlayerSheetParticipant, "answersJson">,
): boolean {
  const a = parseAnswersJson(participant.answersJson);
  const type = str(a, "participant_type").toLowerCase();
  // Empty / missing defaults to Player (roster imports)
  if (!type || type === "player") return true;
  return false;
}

export function filterPlayerSheetParticipants<T extends PlayerSheetParticipant>(
  participants: T[],
): T[] {
  return participants.filter((p) => isPlayerSheetEligible(p));
}

/**
 * Printable HTML: one player per page, letter portrait.
 * mode=cards: compact multi-card layout (still page-break friendly).
 */
export function buildPlayerSheetsHtml(input: {
  org: PlayerSheetOrg;
  event: PlayerSheetEvent;
  participants: PlayerSheetParticipant[];
  /** full = 1/page; cards = up to 2 per page */
  layout?: "full" | "cards";
  generatedAt?: Date;
}): string {
  const layout = input.layout ?? "full";
  const generated = (input.generatedAt ?? new Date()).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const logo = input.org.logoAbsoluteUrl || input.org.logoPath;
  const teamLine = [input.event.teamLabel, input.event.name]
    .filter(Boolean)
    .join(" · ");

  // Coaches/managers never get binder cards — director CSV only
  const eligible = filterPlayerSheetParticipants(input.participants);
  const sheets = eligible.map((p) => {
    const d = resolvePlayerSheetData(p);
    if (layout === "cards") {
      return `
<article class="card">
  <div class="card-head">
    <div>
      <h2>${escapeHtml(d.playerName)}</h2>
      <p class="meta">#${escapeHtml(displayOrDash(d.uniformNumber))}
        · ${escapeHtml(displayOrDash(d.ageGroup))}
        · ${escapeHtml(displayOrDash(d.positions))}
        · B${escapeHtml(displayOrDash(d.bats))}/T${escapeHtml(displayOrDash(d.throws))}
      </p>
    </div>
  </div>
  <div class="grid2">
    <div>
      <h3>Guardians</h3>
      <p><strong>${escapeHtml(displayOrDash(d.guardian1Name))}</strong><br/>
      ${escapeHtml(displayOrDash(d.guardian1Phone))}<br/>
      ${escapeHtml(displayOrDash(d.guardian1Email))}</p>
      ${
        d.guardian2Name || d.guardian2Email || d.guardian2Phone
          ? `<p><strong>${escapeHtml(displayOrDash(d.guardian2Name))}</strong><br/>
      ${escapeHtml(displayOrDash(d.guardian2Phone))}<br/>
      ${escapeHtml(displayOrDash(d.guardian2Email))}</p>`
          : ""
      }
    </div>
    <div>
      <h3>Health</h3>
      <p><strong>Allergies:</strong> ${multilineHtml(d.allergies)}</p>
      <p><strong>Sleep:</strong> ${multilineHtml(d.sleep)}</p>
      <p><strong>Anxiety:</strong> ${multilineHtml(d.anxiety)}</p>
      <p><strong>Meds:</strong> ${multilineHtml(d.medications)}</p>
      <p><strong>Other:</strong> ${multilineHtml(d.otherConcerns)}</p>
    </div>
  </div>
</article>`;
    }

    return `
<article class="sheet">
  <header class="sheet-header">
    <div class="brand">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="" class="logo"/>` : ""}
      <div>
        <p class="org">${escapeHtml(input.org.name)}</p>
        <h1>Player travel sheet</h1>
        <p class="event">${escapeHtml(teamLine)}</p>
      </div>
    </div>
    <div class="player-block">
      <p class="player-name">${escapeHtml(d.playerName)}</p>
      <p class="player-meta">
        Uniform <strong>#${escapeHtml(displayOrDash(d.uniformNumber))}</strong>
        · ${escapeHtml(displayOrDash(d.ageGroup))}
        · ${escapeHtml(displayOrDash(d.team || input.event.teamLabel || ""))}
      </p>
    </div>
  </header>

  <section>
    <h2>Roster</h2>
    <table class="kv">
      <tr><th>Type</th><td>${escapeHtml(displayOrDash(d.participantType))}</td>
          <th>Position(s)</th><td>${escapeHtml(displayOrDash(d.positions))}</td></tr>
      <tr><th>Bats</th><td>${escapeHtml(displayOrDash(d.bats))}</td>
          <th>Throws</th><td>${escapeHtml(displayOrDash(d.throws))}</td></tr>
    </table>
  </section>

  <section>
    <h2>Guardians / contacts</h2>
    <table class="kv">
      <tr>
        <th>Guardian 1</th>
        <td colspan="3">
          <strong>${escapeHtml(displayOrDash(d.guardian1Name))}</strong><br/>
          Phone: ${escapeHtml(displayOrDash(d.guardian1Phone))}<br/>
          Email: ${escapeHtml(displayOrDash(d.guardian1Email))}
        </td>
      </tr>
      <tr>
        <th>Guardian 2</th>
        <td colspan="3">
          <strong>${escapeHtml(displayOrDash(d.guardian2Name))}</strong><br/>
          Phone: ${escapeHtml(displayOrDash(d.guardian2Phone))}<br/>
          Email: ${escapeHtml(displayOrDash(d.guardian2Email))}
        </td>
      </tr>
    </table>
  </section>

  <section>
    <h2>Health and allergy information</h2>
    <p class="sub">Information needed for travel consideration — coaching staff only</p>
    <div class="health-block">
      <h3>Allergies</h3>
      <div class="box">${multilineHtml(d.allergies)}</div>
      <h3>Sleep concerns or issues</h3>
      <div class="box">${multilineHtml(d.sleep)}</div>
      <h3>Any history of anxiety issues</h3>
      <div class="box">${multilineHtml(d.anxiety)}</div>
      <h3>Daily medications (name and regimen)</h3>
      <div class="box">${multilineHtml(d.medications)}</div>
      <h3>Any other concerns or issues not covered above</h3>
      <div class="box">${multilineHtml(d.otherConcerns)}</div>
    </div>
  </section>

  <footer class="sheet-footer">
    <span>Confidential — coaching staff only</span>
    <span>${escapeHtml(generated)} · Form: ${escapeHtml(d.formStatus)}</span>
  </footer>
</article>`;
  });

  const bodyClass = layout === "cards" ? "layout-cards" : "layout-full";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Player sheets — ${escapeHtml(input.event.name)}</title>
  <style>
    @page { size: letter portrait; margin: 0.5in; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      color: #111;
      font-size: 11pt;
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

    .layout-full .sheet {
      page-break-after: always;
      break-after: page;
      min-height: 9.5in;
      padding: 0.15in 0.1in;
      display: flex; flex-direction: column;
    }
    .layout-full .sheet:last-child { page-break-after: auto; }

    .sheet-header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
    .brand { display: flex; gap: 12px; align-items: center; }
    .logo { width: 56px; height: 56px; object-fit: contain; }
    .org { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #444; }
    h1 { margin: 2px 0; font-size: 16pt; }
    .event { margin: 0; color: #333; font-size: 10.5pt; }
    .player-block { margin-top: 10px; }
    .player-name { margin: 0; font-size: 20pt; font-weight: 700; }
    .player-meta { margin: 4px 0 0; color: #333; }

    section { margin: 12px 0; }
    h2 {
      margin: 0 0 6px; font-size: 11pt; text-transform: uppercase;
      letter-spacing: 0.05em; border-bottom: 1px solid #ccc; padding-bottom: 3px;
    }
    .sub { margin: -2px 0 8px; font-size: 9.5pt; color: #555; font-style: italic; }
    table.kv { width: 100%; border-collapse: collapse; }
    table.kv th {
      text-align: left; width: 18%; vertical-align: top;
      padding: 5px 6px 5px 0; color: #444; font-weight: 600; font-size: 10pt;
    }
    table.kv td { vertical-align: top; padding: 5px 6px; font-size: 10.5pt; }
    .health-block h3 { margin: 8px 0 3px; font-size: 10pt; color: #222; }
    .box {
      min-height: 2.2em; border: 1px solid #ccc; border-radius: 4px;
      padding: 6px 8px; background: #fafafa; white-space: pre-wrap;
    }
    .sheet-footer {
      margin-top: auto; padding-top: 12px; border-top: 2px solid #111;
      display: flex; justify-content: space-between; gap: 12px;
      font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    }

    /* Cards layout */
    .layout-cards { padding: 0.25in; }
    .cards-wrap { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media screen { .cards-wrap { max-width: 8.5in; margin: 0 auto; } }
    .card {
      border: 1px solid #222; border-radius: 6px; padding: 10px 12px;
      page-break-inside: avoid; break-inside: avoid;
    }
    .card h2 { margin: 0; font-size: 13pt; border: 0; }
    .card .meta { margin: 2px 0 8px; font-size: 9.5pt; color: #333; }
    .card h3 { margin: 0 0 4px; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; color: #444; }
    .card .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .card p { margin: 0 0 6px; font-size: 9.5pt; }
    .cards-footer {
      margin-top: 16px; text-align: center; font-size: 9pt; font-weight: 700;
      text-transform: uppercase; border-top: 1px solid #999; padding-top: 8px;
    }
  </style>
</head>
<body class="${bodyClass}">
  <div class="toolbar">
    <button type="button" onclick="window.print()">Print</button>
    <span>${escapeHtml(input.org.shortName)} · ${escapeHtml(input.event.name)} · ${eligible.length} player(s)</span>
    <span class="muted">Players only · coaches on director spreadsheet</span>
  </div>
  ${
    layout === "cards"
      ? `<div class="cards-wrap">${sheets.join("\n")}
         <p class="cards-footer">Players only · coaches on director spreadsheet · ${escapeHtml(generated)}</p>
         </div>`
      : sheets.join("\n")
  }
</body>
</html>`;
}

/** Build multi-page letter PDF (one player per page) via jsPDF. */
export async function buildPlayerSheetsPdf(input: {
  org: PlayerSheetOrg;
  event: PlayerSheetEvent;
  participants: PlayerSheetParticipant[];
}): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;
  const generated = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const participants = filterPlayerSheetParticipants(input.participants);

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

  const teamLine = [input.event.teamLabel, input.event.name].filter(Boolean).join(" · ");

  if (participants.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text("No player sheets — coaches/staff are director spreadsheet only.", margin, margin + 20);
    return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  }

  participants.forEach((p, idx) => {
    if (idx > 0) doc.addPage();
    const d = resolvePlayerSheetData(p);
    let y = margin;

    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", margin, y, 40, 40);
      } catch {
        /* ignore bad image */
      }
    }

    const textX = logoDataUrl ? margin + 50 : margin;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(input.org.name.toUpperCase(), textX, y + 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Player travel sheet", textX, y + 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(teamLine, textX, y + 42);

    y += 58;
    doc.setDrawColor(0);
    doc.setLineWidth(1.2);
    doc.line(margin, y, pageW - margin, y);
    y += 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(d.playerName, margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(
      `Uniform #${displayOrDash(d.uniformNumber)}  ·  ${displayOrDash(d.ageGroup)}  ·  ${displayOrDash(d.team || input.event.teamLabel || "")}`,
      margin,
      y,
    );
    y += 20;

    const section = (title: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text(title.toUpperCase(), margin, y);
      y += 4;
      doc.setDrawColor(180);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 14;
    };

    const line = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`${label}:`, margin, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(displayOrDash(value), contentW - 100);
      doc.text(lines, margin + 100, y);
      y += Math.max(14, lines.length * 12);
    };

    const block = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(label, margin, y);
      y += 12;
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(displayOrDash(value), contentW);
      doc.text(lines, margin, y);
      y += Math.max(16, lines.length * 12 + 6);
      if (y > pageH - 80) {
        /* keep on page — truncate soft */
      }
    };

    section("Roster");
    line("Type", d.participantType);
    line("Position(s)", d.positions);
    line("Bats / Throws", `${displayOrDash(d.bats)} / ${displayOrDash(d.throws)}`);
    y += 6;

    section("Guardians / contacts");
    line("Guardian 1", d.guardian1Name);
    line("Phone", d.guardian1Phone);
    line("Email", d.guardian1Email);
    y += 4;
    line("Guardian 2", d.guardian2Name);
    line("Phone", d.guardian2Phone);
    line("Email", d.guardian2Email);
    y += 8;

    section("Health and allergy information");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text("For travel consideration — coaching staff only", margin, y);
    doc.setTextColor(0);
    y += 14;

    block("Allergies", d.allergies);
    block("Sleep concerns or issues", d.sleep);
    block("Any history of anxiety issues", d.anxiety);
    block("Daily medications (name and regimen)", d.medications);
    block("Any other concerns or issues not covered above", d.otherConcerns);

    // Footer
    const footerY = pageH - 28;
    doc.setDrawColor(0);
    doc.setLineWidth(1);
    doc.line(margin, footerY - 10, pageW - margin, footerY - 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("CONFIDENTIAL — COACHING STAFF ONLY", margin, footerY);
    doc.setFont("helvetica", "normal");
    doc.text(`${generated} · ${d.formStatus}`, pageW - margin, footerY, {
      align: "right",
    });
  });

  const arrayBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}
