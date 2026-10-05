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
/** Which cutoff a saved division was using. Missing on rows saved before combined Spring. */
export type CutoffPreset = "little-league" | "dyb" | "custom";

export type DivisionAgeConfig = {
  code: string;
  label: string;
  minAge: number;
  maxAge: number;
  oldestBirthdate?: string;
  youngestBirthdate?: string;
  /**
   * Optional badge for a season row. Absent on older saved JSON and on league defaults.
   * `custom` is a window that is not exactly Apr 30 or Aug 31 for these ages.
   */
  cutoffPreset?: CutoffPreset;
  sortOrder: number;
  /**
   * Optional team size on a league-default division. Missing means the
   * forecast default of 11–12. Seasons do not store these.
   */
  rosterMin?: number;
  rosterMax?: number;
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
