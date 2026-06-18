/** Normalized feeder token (e.g. W1, L4) or a team name for openers. */
export type PdfGameFeeder = string;

export type PdfParsedGameSlots = {
  gameNumber: number;
  home?: PdfGameFeeder;
  away?: PdfGameFeeder;
};

export type PdfGameScheduleLine = {
  dateLabel?: string;
  time?: string;
  field?: string;
};

const FEEDER_SLOT_RE = /6T-G(\d+)-T([12])\s*\n([^\n]+)/gi;
const GAME_INFO_SCHEDULE_RE = /6T-G(\d+)-Info\s*\nGame #\d+ Info\s*\n([^\n]+)/gi;
const SCHEDULE_LINE_RE = /^(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2}\s*(?:am|pm))\s+(\S+)$/i;

/** Convert DocHub labels like "Winner of Game #1" into bracket feeder tokens. */
export function normalizePdfFeederLabel(label: string): PdfGameFeeder {
  const trimmed = label.trim();
  const winner = /Winner of Game #(\d+)/i.exec(trimmed);
  if (winner) return `W${winner[1]}`;
  const loser = /Loser (?:From|of) Game #(\d+)/i.exec(trimmed);
  if (loser) return `L${loser[1]}`;
  return trimmed;
}

/** Parse `6T-G{n}-T{1|2}` feeder slots from a Little League bracket PDF export. */
export function parsePdfGameFeederSlots(text: string): PdfParsedGameSlots[] {
  const byGame = new Map<number, { home?: PdfGameFeeder; away?: PdfGameFeeder }>();
  for (const match of text.matchAll(FEEDER_SLOT_RE)) {
    const gameNumber = Number.parseInt(match[1] ?? "", 10);
    const slot = match[2];
    const feeder = normalizePdfFeederLabel(match[3] ?? "");
    if (!Number.isFinite(gameNumber) || gameNumber < 1) continue;
    const entry = byGame.get(gameNumber) ?? {};
    if (slot === "1") entry.home = feeder;
    else if (slot === "2") entry.away = feeder;
    byGame.set(gameNumber, entry);
  }
  return [...byGame.entries()]
    .sort(([a], [b]) => a - b)
    .map(([gameNumber, slots]) => ({ gameNumber, ...slots }));
}

/** Parse schedule lines attached to `Game #N Info` blocks (e.g. `6/26 7:30pm F4`). */
export function parsePdfGameSchedule(text: string): Map<number, PdfGameScheduleLine> {
  const map = new Map<number, PdfGameScheduleLine>();

  // DocHub exports may repeat Game Info blocks after revisions — keep the last schedule per game.
  for (const match of text.matchAll(GAME_INFO_SCHEDULE_RE)) {
    const gameNumber = Number.parseInt(match[1] ?? "", 10);
    const line = (match[2] ?? "").trim();
    if (!Number.isFinite(gameNumber) || !line) continue;
    const parsed = parseScheduleLine(line);
    if (parsed) map.set(gameNumber, parsed);
  }

  // Fallback: lines immediately following "Game #N Info" without the 6T-G prefix.
  const looseRe = /Game #(\d+) Info\s*\n([^\n]+)/gi;
  for (const match of text.matchAll(looseRe)) {
    const gameNumber = Number.parseInt(match[1] ?? "", 10);
    const line = (match[2] ?? "").trim();
    if (!Number.isFinite(gameNumber) || !line) continue;
    if (/^Game #/i.test(line) || /^6T-G/i.test(line)) continue;
    const parsed = parseScheduleLine(line);
    if (parsed) map.set(gameNumber, parsed);
  }

  // Visual PDF text often appears as:
  //   Game 4
  //   Loser to B
  //   6/28 12:30pm F1
  // Keep scanning after each game label until the next game label.
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let currentGame: number | null = null;
  for (const line of lines) {
    const game = /^Game\s*#?\s*(\d+)\b/i.exec(line);
    if (game) {
      const n = Number.parseInt(game[1] ?? "", 10);
      currentGame = Number.isFinite(n) ? n : null;
      continue;
    }
    if (currentGame == null || map.has(currentGame)) continue;
    const parsed = parseScheduleLine(line);
    if (parsed) map.set(currentGame, parsed);
  }

  return map;
}

export function parseScheduleLine(line: string): PdfGameScheduleLine | null {
  const m = SCHEDULE_LINE_RE.exec(line.trim());
  if (!m) return null;
  return {
    dateLabel: m[1],
    time: m[2],
    field: m[3],
  };
}

const SIX_TEAM_LATE_FEEDERS: Record<number, { home: string; away: string }> = {
  5: { home: "L1", away: "L4" },
  6: { home: "L2", away: "L3" },
  7: { home: "W3", away: "W4" },
  8: { home: "W5", away: "W6" },
  9: { home: "L7", away: "W8" },
  10: { home: "W7", away: "W9" },
};

/** True when parsed feeders match the official Little League 6-team game shell through G10. */
export function pdfFeedersMatchLittleLeagueSixTeamDe(slots: PdfParsedGameSlots[]): boolean {
  for (const [n, exp] of Object.entries(SIX_TEAM_LATE_FEEDERS)) {
    const game = slots.find((s) => s.gameNumber === Number(n));
    if (!game || game.home !== exp.home || game.away !== exp.away) return false;
  }
  const g4 = slots.find((s) => s.gameNumber === 4);
  if (!g4 || g4.home !== "W2") return false;
  return true;
}

/** @deprecated Use {@link pdfFeedersMatchLittleLeagueSixTeamDe}. */
export const pdfFeedersMatchSixTeamModifiedDe = pdfFeedersMatchLittleLeagueSixTeamDe;

/** G11 with W10 vs L10 feeders is the standard if-necessary rematch (dotted line on LL PDFs). */
export function pdfFeedersIndicateSixTeamIfNecessary(slots: PdfParsedGameSlots[]): boolean {
  const g11 = slots.find((s) => s.gameNumber === 11);
  return g11?.home === "W10" && g11?.away === "L10";
}

export function inferSixTeamChampionshipSeriesStyleFromFeeders(
  slots: PdfParsedGameSlots[],
): "always_scheduled_reset" | "winner_take_all" | null {
  if (!pdfFeedersMatchLittleLeagueSixTeamDe(slots)) return null;
  return pdfFeedersIndicateSixTeamIfNecessary(slots) ? "always_scheduled_reset" : "winner_take_all";
}
