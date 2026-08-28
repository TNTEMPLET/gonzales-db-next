import type { BracketMatch, BracketRound } from "@/lib/tournament-brackets/bracketSpec";

export type BracketMatchSchedulePatch = {
  dateLabel?: string;
  time?: string;
  field?: string;
  venue?: string;
};

/** Apply date/time/field/venue patches keyed by `officialGameNumber`. */
export function applyScheduleByGameNumber(
  rounds: BracketRound[],
  patches: Record<string, BracketMatchSchedulePatch>,
  defaultVenue?: string,
): BracketRound[] {
  return rounds.map((r) => ({
    ...r,
    matches: r.matches.map((m) => {
      const g = m.officialGameNumber?.trim();
      if (!g) return m;
      const patch = patches[g];
      if (!patch) return m;
      return {
        ...m,
        ...(patch.dateLabel ? { dateLabel: patch.dateLabel } : {}),
        ...(patch.time ? { time: patch.time } : {}),
        ...(patch.field ? { field: patch.field } : {}),
        venue: patch.venue ?? defaultVenue ?? m.venue,
      };
    }),
  }));
}

/** Replace generated match ids with stable `prefix-g{n}` ids for seeds and migrations. */
export function withStableMatchIds(rounds: BracketRound[], prefix: string): BracketRound[] {
  return rounds.map((r) => ({
    ...r,
    matches: r.matches.map((m) => {
      const g = m.officialGameNumber?.trim();
      return { ...m, id: g ? `${prefix}-g${g}` : m.id };
    }),
  }));
}

export function countFirstRoundByeMatches(rounds: BracketRound[]): number {
  const wbR1 = rounds.find((r) => r.bracketSection === "winners");
  if (!wbR1) return 0;
  return wbR1.matches.filter(
    (m) => m.home.trim() === "BYE" || m.away.trim() === "BYE",
  ).length;
}

export function firstRoundNonByeMatches(rounds: BracketRound[]): BracketMatch[] {
  const wbR1 = rounds.find((r) => r.bracketSection === "winners");
  if (!wbR1) return [];
  return wbR1.matches.filter(
    (m) => m.home.trim() !== "BYE" && m.away.trim() !== "BYE",
  );
}
