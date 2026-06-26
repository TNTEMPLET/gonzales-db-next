export type ScheduleManagerRunMode = "DRY_RUN" | "LIVE" | "CRON";

export type ScheduleManagerActionSummary = {
  bracketProjectId: string;
  matchId: string;
  divisionLabel?: string;
  gameNumber?: string;
  dateLabel?: string;
  time?: string;
  scheduledFor?: Date;
  venue?: string;
  field?: string;
  homeTeam: string;
  awayTeam: string;
};

export type ScheduleManagerSkippedGame = {
  matchId: string;
  reason:
    | "already_pinned"
    | "already_logged"
    | "already_scored"
    | "missing_team"
    | "placeholder_team"
    | "missing_schedule";
};

export type GameChangerCreateGameInput = {
  bracketProjectId: string;
  matchId: string;
  date?: string;
  time?: string;
  scheduledFor?: Date;
  field?: string;
  venue?: string;
  homeTeam: string;
  awayTeam: string;
  division?: string;
  gameNumber?: string;
};

export type GameChangerCreateGameResult = {
  eventId?: string;
  dryRun: boolean;
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  warnings?: string[];
};
