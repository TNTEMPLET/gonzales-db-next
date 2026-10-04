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

export type {
  BirthBucket,
  BucketAssignment,
  CompareConfigsResult,
  DivisionAssignment,
  ForecastConfig,
  EligibilityContrast,
  EligibilitySide,
  ForecastFlow,
  ForecastOptions,
  ForecastPopulation,
  ForecastRow,
  ForecastSide,
  LeagueTotals,
  PoolSplit,
  Projection,
  RosterSize,
  SharedPool,
  TeamCountRange,
} from "./forecast";

export {
  DEFAULT_FEEDER_SHARE,
  DEFAULT_RETURN_RATE,
  DEFAULT_ROSTER,
  DYB_RULE,
  FALLBACK_RETENTION,
  LITTLE_LEAGUE_RULE,
  appliedFeeder,
  assignBuckets,
  carryoverRate,
  compareConfigs,
  eligibilityContrasts,
  eligibilityForConfigs,
  projectDivision,
  teamCountRange,
} from "./forecast";

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
