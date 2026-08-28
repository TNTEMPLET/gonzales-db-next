/**
 * Short, consistent labels for bracket match cards (React + HTML export).
 * Feeder placeholders use `W` + game id; scheduled game headers use `G` + id.
 */

import { BYE_SLOT_LABEL } from "@/lib/tournament-brackets/generateSingleElimFromTeams";

const DIVISION_DISPLAY_ALIASES: Record<string, string> = {
  littleleaguecoachpitch: "Coaches Pitch",
  litleleaguecoachpitch: "Coaches Pitch",
  littleleagueteeball: "Tee Ball",
  litleleagueteeball: "Tee Ball",
};

function finalizeDivisionDisplayLabel(label: string): string {
  const withoutLittleLeague = label.replace(/^Little\s+League\s+/i, "").trim();
  if (
    /\bcoach(?:es)?\s+pitch\b/i.test(withoutLittleLeague) ||
    /\btee\s+ball\b/i.test(withoutLittleLeague)
  ) {
    return withoutLittleLeague.replace(/\bCoach\s+Pitch\b/i, "Coaches Pitch");
  }
  return label;
}

/** Restore readable spacing for PDF/OCR division labels like `LittleLeagueCoachPitch`. */
export function formatDivisionDisplayLabel(label: string | undefined | null): string | undefined {
  const trimmed = label?.trim();
  if (!trimmed) return undefined;

  const aliasKey = trimmed.toLowerCase().replace(/\s+/g, "");
  const alias = DIVISION_DISPLAY_ALIASES[aliasKey];
  if (alias) return alias;

  if (/\s/.test(trimmed)) {
    return finalizeDivisionDisplayLabel(trimmed.replace(/^Litle\b/i, "Little"));
  }

  return finalizeDivisionDisplayLabel(
    trimmed
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/^Litle\b/i, "Little")
      .trim(),
  );
}

/** Row header when `officialGameNumber` is set (e.g. `G12`, `G2`). */
export function formatBracketGameBadge(officialGameNumber: string | undefined): string | undefined {
  const t = officialGameNumber?.trim();
  if (!t) return undefined;
  return `G${t}`;
}

/** Game badge with optional championship series suffix. */
export function formatChampionshipGameBadge(m: {
  officialGameNumber?: string;
  championshipRole?: "grand_final" | "if_necessary";
}): string | undefined {
  const base = formatBracketGameBadge(m.officialGameNumber);
  if (m.championshipRole === "if_necessary") {
    return base ? `${base} (if necessary)` : "If necessary";
  }
  if (m.championshipRole === "grand_final") {
    return base ? `${base} — Championship` : "Championship";
  }
  return base;
}

/**
 * Placeholder for the loser of a semi-final match (e.g. `L8` = loser of game 8).
 * Prefers `officialGameNumber`, then `bracketGameNumber`; otherwise `TBD`.
 */
export function formatSemiLoserSlotLabel(m: {
  officialGameNumber?: string;
  bracketGameNumber?: number;
}): string {
  const raw = m.officialGameNumber?.trim();
  const n = raw && raw.length > 0 ? raw : (m.bracketGameNumber != null ? String(m.bracketGameNumber) : "");
  if (!n) return "TBD";
  return `L${n}`;
}

/** Bracket surface heading: label only (trailing period trimmed). With `suffix`, uses `Label — suffix` or `suffix` alone if no label. */
export function bracketSurfaceTitle(divisionLabel?: string, suffix?: string): string {
  const raw = formatDivisionDisplayLabel(divisionLabel);
  const label = raw?.replace(/\.\s*$/, "") ?? "";
  const suf = suffix?.trim();
  if (suf) {
    return label ? `${label} — ${suf}` : suf;
  }
  return label;
}

type FinalChampionMeta = {
  slotHome: string;
  slotAway: string;
  home?: string;
  away?: string;
  homeScore?: number;
  awayScore?: number;
  winnerSide?: "home" | "away";
};

/** When the final has a bye, the non-bye side is the declared champion; else winner from scores or `TBD`. */
export function declaredChampionFromFinalSlots(
  slotHome: string,
  slotAway: string,
  meta?: FinalChampionMeta,
): string {
  const h = slotHome.trim();
  const a = slotAway.trim();
  if (h === BYE_SLOT_LABEL && a !== BYE_SLOT_LABEL) return a;
  if (a === BYE_SLOT_LABEL && h !== BYE_SLOT_LABEL) return h;
  if (meta?.homeScore != null && meta?.awayScore != null) {
    if (meta.homeScore > meta.awayScore) return h;
    if (meta.awayScore > meta.homeScore) return a;
    if (meta.winnerSide === "home") return h;
    if (meta.winnerSide === "away") return a;
  }
  return "TBD";
}

/** Same logic as the final for the standalone 3rd-place game. */
export function declaredThirdPlaceFromSlots(slotHome: string, slotAway: string): string {
  return declaredChampionFromFinalSlots(slotHome, slotAway);
}

type FeederForWinnerLabel = { officialGameNumber?: string };

/**
 * Placeholder for a slot fed by an earlier match (e.g. `W3`).
 * Uses the feeder’s `officialGameNumber` when set; otherwise `bracketGameNumber`.
 */
export function formatWinnerFeederSlotLabel(feeder: FeederForWinnerLabel, bracketGameNumber: number): string {
  const raw = feeder.officialGameNumber?.trim();
  const n = raw && raw.length > 0 ? raw : String(bracketGameNumber);
  return `W${n}`;
}

/** Optional date / time / field / venue shown on each bracket game card. */
export type MatchCardScheduleMeta = {
  dateLabel?: string;
  time?: string;
  venue?: string;
  field?: string;
};

export function hasMatchCardScheduleMeta(m: MatchCardScheduleMeta): boolean {
  return Boolean(m.dateLabel?.trim() || m.time?.trim() || m.venue?.trim() || m.field?.trim());
}

/** First line: date · time; second: field · venue (field first when both set). */
export function matchCardScheduleWhenWhere(m: MatchCardScheduleMeta): { when?: string; where?: string } {
  const when = [m.dateLabel?.trim(), m.time?.trim()].filter(Boolean).join(" · ") || undefined;
  const where = [m.field?.trim(), m.venue?.trim()].filter(Boolean).join(" · ") || undefined;
  return { when, where };
}

/** Default copy for column headers when no schedule is set on a round (matches Bracket structure editor). */
export const BRACKET_GAME_SCHEDULE_PLACEHOLDERS = {
  dateLabel: "Sat 6/7",
  time: "6:00 PM",
  field: "Field 2",
  venue: "Main complex",
} as const;

export type RoundColumnScheduleHdr = {
  when: string;
  where: string;
  /** True when every line uses placeholder text (no schedule on any match in the round). */
  isPlaceholder: boolean;
};

/** Per-match game info between teams: real schedule when set, else placeholders. */
export function matchCardGameInfoLines(m: MatchCardScheduleMeta): RoundColumnScheduleHdr {
  return roundColumnScheduleHdrLines([m]);
}

/** Column header schedule: first match in the round with data, else placeholders. */
export function roundColumnScheduleHdrLines(
  matches: readonly MatchCardScheduleMeta[],
): RoundColumnScheduleHdr {
  const rep = matches.find((m) => hasMatchCardScheduleMeta(m));
  if (!rep) {
    const p = BRACKET_GAME_SCHEDULE_PLACEHOLDERS;
    return {
      when: `${p.dateLabel} · ${p.time}`,
      where: `${p.field} · ${p.venue}`,
      isPlaceholder: true,
    };
  }
  const { when, where } = matchCardScheduleWhenWhere(rep);
  const p = BRACKET_GAME_SCHEDULE_PLACEHOLDERS;
  return {
    when: when ?? `${p.dateLabel} · ${p.time}`,
    where: where ?? `${p.field} · ${p.venue}`,
    isPlaceholder: !when && !where,
  };
}
