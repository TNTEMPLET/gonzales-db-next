import type { Prisma } from "@prisma/client";

export type SchedulerErrorCode =
  | "INVALID_INPUT"
  | "MISSING_SEASON"
  | "MISSING_MATRIX_RULES"
  | "MISSING_TEAMS"
  | "INSUFFICIENT_SLOTS"
  | "CONFLICT";

export class SchedulerError extends Error {
  constructor(
    message: string,
    public readonly code: SchedulerErrorCode,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "SchedulerError";
  }
}

export type SchedulerTeam = {
  id: string;
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
  teamName: string;
};

export type SchedulerSeason = {
  id: string;
  organizationId: string;
  seasonYear: number;
  name: string;
  startsOn: Date | null;
  endsOn: Date | null;
  defaultGameTimes: Prisma.JsonValue;
  settings?: Prisma.JsonValue;
};

export type SchedulerPark = {
  id: string;
  organizationId: string;
  name: string;
  shortName: string | null;
};

export type SchedulerField = {
  id: string;
  organizationId: string;
  parkId: string;
  name: string;
  shortName: string | null;
  supportedAgeGroups: Prisma.JsonValue;
  supportedDivisions: Prisma.JsonValue;
  isActive: boolean;
  park?: SchedulerPark;
};

export type SchedulerAvailability = {
  id: string;
  organizationId: string;
  seasonId: string | null;
  parkId: string;
  fieldId: string | null;
  availabilityType: "AVAILABLE" | "BLACKOUT";
  date: Date | null;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
};

export type SchedulerDivisionRule = {
  id: string;
  organizationId: string;
  seasonId: string;
  division: string;
  ageGroup: string | null;
  preferredParkId: string | null;
  preferredFieldId: string | null;
  allowedParkIds: Prisma.JsonValue;
  allowedFieldIds: Prisma.JsonValue;
  allowedGameTimes: Prisma.JsonValue;
  minDaysBetweenGames: number | null;
  maxGamesPerWeek: number | null;
  avoidBackToBack: boolean;
  ruleMetadata: Prisma.JsonValue;
};

export type SchedulerSlot = {
  id: string;
  date: Date;
  gameDate: string;
  startTime: string;
  endTime: string;
  parkId: string;
  fieldId: string;
  parkName?: string;
  fieldName?: string;
  supportedAgeGroups: string[];
  supportedDivisions: string[];
};

export type RoundRobinMatchup = {
  division: string;
  ageGroup: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  roundLabel: string;
  gameNumber: number;
};

export type GeneratedDraftGame = RoundRobinMatchup & {
  gameDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  parkId: string | null;
  fieldId: string | null;
  status: "DRAFT" | "CONFLICT";
  sortOrder: number;
  conflictFlags: string[];
  fairnessMetadata: Prisma.JsonObject;
  schedulerNotes: string | null;
};

export type SchedulerFairnessSummary = {
  teams: Array<{
    teamId: string;
    teamName: string;
    division: string;
    ageGroup: string;
    earlyGames: number;
    lateGames: number;
    homeGames: number;
    awayGames: number;
    totalGames: number;
  }>;
  unscheduledGames: Array<{
    gameNumber: number;
    division: string;
    ageGroup: string;
    homeTeamName: string;
    awayTeamName: string;
    reasons: string[];
  }>;
};

export type SchedulerGenerationResult = {
  seasonId: string;
  organizationId: string;
  requestedDivisions: string[];
  slots: SchedulerSlot[];
  games: GeneratedDraftGame[];
  fairness: SchedulerFairnessSummary;
  errors: Array<{ code: SchedulerErrorCode; message: string; details?: unknown }>;
};
