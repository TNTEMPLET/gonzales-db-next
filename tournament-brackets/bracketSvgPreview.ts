/**
 * Minimal single-elimination SVG preview (4–8 team placeholders).
 * Falls back to a simple game list when structure is unknown.
 */

import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";

export function buildBracketSvgPreview(spec: BracketSpec): string {
  const teams = spec.teams.filter(Boolean);
  const games = spec.games;

  if (games.length > 0) {
    const rows = games
      .slice(0, 24)
      .map(
        (g, i) =>
          `<text x="20" y="${36 + i * 22}" font-size="12" fill="#001a3d">${escapeXml(
            `${i + 1}. ${g.homeTeam} vs ${g.awayTeam}`,
          )}</text>`,
      )
      .join("\n");
    const h = 52 + Math.min(games.length, 24) * 22;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="${h}" viewBox="0 0 560 ${h}">
  <rect width="100%" height="100%" fill="#eef2f7"/>
  <text x="20" y="26" font-size="14" font-weight="bold" fill="#001a3d">${escapeXml(
    spec.divisionLabel?.trim() ? `Games (${spec.divisionLabel.trim()})` : "Games",
  )}</text>
  <rect x="18" y="30" width="220" height="3" fill="#c8102e"/>
  ${rows}
</svg>`;
  }

  if (teams.length >= 2) {
    const t = teams.slice(0, 8);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120" viewBox="0 0 400 120">
  <rect width="100%" height="100%" fill="#eef2f7"/>
  <text x="20" y="26" font-size="14" font-weight="bold" fill="#001a3d">Teams (${t.length})</text>
  <rect x="18" y="30" width="160" height="3" fill="#c8102e"/>
  ${t.map((name, i) => `<text x="20" y="${54 + i * 18}" font-size="12" fill="#002f6c">${escapeXml(name)}</text>`).join("")}
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80" viewBox="0 0 400 80">
  <rect width="100%" height="100%" fill="#eef2f7"/>
  <text x="20" y="44" font-size="13" fill="#4a667f">Import an XLSX of games or define rounds in Bracket structure to preview the bracket.</text>
</svg>`;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
