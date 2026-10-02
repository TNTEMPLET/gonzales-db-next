export type RainoutDeliveryOutcome = "send" | "dry_run" | "suppressed" | "allowlist";

export type RainoutAppearanceView = {
  playerName: string;
  teamName: string;
  ageGroup: string;
  parkName: string;
  timeLabel: string;
  opponent: string;
  rainedOut: boolean;
};

export type RainoutFamilyView = {
  email: string;
  mode: "all_games" | "mixed";
  subject: string;
  text: string;
  outcome: RainoutDeliveryOutcome;
  appearances: RainoutAppearanceView[];
};

export type RainoutNotifySummary = {
  phase: "preview" | "posted";
  dryRun: boolean;
  emailsEnabled: boolean;
  allowlistActive: boolean;
  calendarDate: string;
  allParksOut: boolean;
  parks: string[];
  newlyAffectedParks: string[];
  sent: number;
  dryRunCount: number;
  skippedSuppressed: number;
  skippedAllowlist: number;
  failed: number;
  families: RainoutFamilyView[];
  error: string | null;
};
