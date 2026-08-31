/**
 * SportsConnect integration types (client-safe).
 * SC remains registration SoR; this platform is the ops hub after export.
 * No official public SportsConnect API — assisted file import only
 * (see docs/sports-connect-integration-plan.md).
 */

export const SPORTS_CONNECT_REPORT_KINDS = [
  "PLAYER_REG",
  "COACH_VOLUNTEER",
  "TEAM_LIST",
] as const;

export type SportsConnectReportKind =
  (typeof SPORTS_CONNECT_REPORT_KINDS)[number];

export const SPORTS_CONNECT_RUN_STATUSES = [
  "PREVIEW",
  "RUNNING",
  "LEASED",
  "DONE",
  "FAILED",
  "QUARANTINED",
  "CANCELLED",
] as const;

export type SportsConnectRunStatus =
  (typeof SPORTS_CONNECT_RUN_STATUSES)[number];

export type SportsConnectReportCatalogEntry = {
  kind: SportsConnectReportKind;
  title: string;
  summary: string;
  /** Operator-facing: where to export in SportsConnect. */
  exportHint: string;
  /** Expected column families (any alias may match). */
  requiredColumnGroups: string[][];
  optionalColumnHints: string[];
  adminPath: string;
  adminLabel: string;
  sortOrder: number;
};

export type ColumnDetectResult = {
  reportKind: SportsConnectReportKind | null;
  confidence: number;
  scores: Record<SportsConnectReportKind, number>;
  matchedHeaders: string[];
  missingRequiredGroups: string[][];
  message: string;
};

export type SportsConnectMappingPresetView = {
  id: string;
  organizationId: string;
  seasonYear: number;
  name: string;
  reportKind: SportsConnectReportKind;
  divisionMapping: Record<string, string>;
  teamMapping: Record<string, string>;
  columnOverrides: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
};

export type RosterQualitySummary = {
  organizationId: string;
  seasonYear: number;
  teamCount: number;
  playerCount: number;
  teamsWithoutCoaches: number;
  teamsWithoutPlayers: number;
  playersMissingGuardianEmail: number;
  playersMissingGuardianContact: number;
  playersReady: number;
  playersIncomplete: number;
  playersBlocked: number;
  lastPlayerImportAt: string | null;
  lastCoachImportAt: string | null;
};

export type PlayerNameCollisionFindingType = "COLLAPSED_REGISTRATION" | "DUPLICATE_ROSTER_ROW";

export type PlayerNameCollisionEnrollmentRow = {
  id: string;
  fullName: string;
  guardianEmail: string | null;
  guardianPhone: string | null;
  birthDate: string | null;
  sportsConnectOrderNo: string | null;
  sportsConnectPlayerId: string | null;
  teamNameRaw: string | null;
};

export type PlayerNameCollisionTeamPlayerRow = {
  id: string;
  fullName: string;
  guardianEmail: string | null;
  guardianPhone: string | null;
  birthDate: string | null;
  sportsConnectPlayerId: string | null;
  teamId: string;
  teamName: string;
};

export type PlayerNameCollisionFinding = {
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
  normalizedName: string;
  findingType: PlayerNameCollisionFindingType;
  enrollmentRows: PlayerNameCollisionEnrollmentRow[];
  teamPlayerRows: PlayerNameCollisionTeamPlayerRow[];
};

export type PlayerNameCollisionReport = {
  organizationId: string;
  seasonYear: number;
  findings: PlayerNameCollisionFinding[];
};

export type SportsConnectImportRunView = {
  id: string;
  organizationId: string;
  seasonYear: number;
  reportKind: SportsConnectReportKind;
  status: SportsConnectRunStatus;
  sourceFileName: string | null;
  presetId: string | null;
  summary: Record<string, unknown> | null;
  errorMessage: string | null;
  teamPlayerBatchId: string | null;
  coachBatchId: string | null;
  driveFileId?: string | null;
  revisionToken?: string | null;
  leaseExpiresAt?: string | null;
  createdAt: string;
  completedAt: string | null;
};

export function isSportsConnectReportKind(
  value: string | null | undefined,
): value is SportsConnectReportKind {
  return (
    !!value &&
    (SPORTS_CONNECT_REPORT_KINDS as readonly string[]).includes(value)
  );
}
