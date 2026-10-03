/**
 * Saved-config shape for division ages. A later slice can persist this
 * object; nothing here knows where the config came from.
 */

/** Cutoff month/day and year offset for one league. Month is 1–12. */
export type LeagueAgeRule = {
  cutoffMonth: number;
  cutoffDay: number;
  /** Added to the season year. Fall Ball is +1 (Fall 2026 ages as of 2027-04-30). */
  yearOffset: number;
};

/**
 * One division. `oldestBirthdate` / `youngestBirthdate` are present only when
 * an admin has overridden the calculated range. Both are `YYYY-MM-DD`.
 */
export type DivisionAgeConfig = {
  code: string;
  label: string;
  minAge: number;
  maxAge: number;
  oldestBirthdate?: string;
  youngestBirthdate?: string;
  sortOrder: number;
};

export type LeagueDivisionConfig = {
  rule: LeagueAgeRule;
  divisions: DivisionAgeConfig[];
};

export type ExactAge = {
  years: number;
  months: number;
};

export type BirthdateRange = {
  /** Earliest birthdate in the division (oldest player), `YYYY-MM-DD`. */
  oldest: string;
  /** Latest birthdate in the division (youngest player), `YYYY-MM-DD`. */
  youngest: string;
};

export type EffectiveBirthdateRange = BirthdateRange & {
  oldestOverridden: boolean;
  youngestOverridden: boolean;
};

export type CoverageWarningKind = "gap" | "overlap" | "invalid";

/** A coverage problem. Callers display these; nothing in this library throws for them. */
export type CoverageWarning = {
  kind: CoverageWarningKind;
  /** Inclusive start of the gap, overlap, or invalid range (`YYYY-MM-DD`). */
  from: string;
  /** Inclusive end (`YYYY-MM-DD`). For `invalid`, `from` may be after `to`. */
  to: string;
  divisionCodes: string[];
};
