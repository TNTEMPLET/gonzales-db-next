/**
 * Division-age calculator. Pure data and date math — no server-only, Prisma,
 * or database imports — so client components can import it.
 */

export type {
  BirthdateRange,
  CoverageWarning,
  CoverageWarningKind,
  DivisionAgeConfig,
  EffectiveBirthdateRange,
  ExactAge,
  LeagueAgeRule,
  LeagueDivisionConfig,
} from "./types";

export {
  calculatedRange,
  coverageWarnings,
  effectiveCutoffDate,
  effectiveRange,
  eligibleDivisions,
  exactAge,
  isSplitWindow,
  leagueAge,
  shiftIsoDateByYears,
} from "./compute";

export { leagueDivisionDefaults } from "./defaults";

export {
  coverageWarningLines,
  coverageWarningLinesForConfig,
  divisionAgeRows,
  divisionAgeRowsForConfig,
  divisionTableTsv,
  divisionTableTsvForConfig,
  formatAgeSpan,
  formatCalendarDate,
  formatExactAgeLabel,
  leagueRuleSentence,
  leagueRuleSentenceForRule,
  lookupIsSplit,
  lookupLeague,
  lookupLeagueForConfig,
  seasonAgeHeadline,
  seasonAgeHeadlineForRule,
} from "./present";

export type { DivisionAgeRow, LeagueLookup } from "./present";
