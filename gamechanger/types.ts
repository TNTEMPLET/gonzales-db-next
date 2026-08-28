import { z } from "zod";

export const bracketGameChangerSchema = z.object({
  widgetId: z.string().uuid(),
  maxVerticalGamesVisible: z.number().int().min(1).max(20).optional(),
  layout: z.enum(["vertical", "horizontal"]).optional(),
  /** When true (default), final GC games auto-import into the bracket on admin poll. */
  autoImportFinalScores: z.boolean().optional(),
  /** GC event IDs already imported so finals are not applied twice. */
  importedFinalEventIds: z.array(z.string().uuid()).optional(),
  /** Bracket match id → GameChanger event UUID. Overrides team-name matching when set. */
  matchEventPins: z.record(z.string().min(1), z.string().uuid()).optional(),
  /** Explicit admin opt-in for Schedule Manager game creation. Off by default. */
  scheduleManagerEnabled: z.boolean().optional(),
});

export type BracketGameChanger = z.infer<typeof bracketGameChangerSchema>;

const gcTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number().optional(),
  is_video_live: z.boolean().optional(),
  has_archived_video: z.boolean().optional(),
});

const gcInningSchema = z.object({
  inning: z.number(),
  half: z.enum(["top", "bottom"]),
});

const gcEventSchema = z.object({
  id: z.string().uuid(),
  start_ts: z.string(),
  timezone: z.string().optional(),
  game_status: z.string().optional(),
  home_team: gcTeamSchema,
  away_team: gcTeamSchema,
  sport_specific: z
    .object({
      bats: z
        .object({
          inning_details: gcInningSchema.optional(),
          /** Cumulative outs in the game; outs in current half = total_outs % 3. */
          total_outs: z.number().int().nonnegative().optional(),
          /** Not currently returned by the public widget API; reserved for future payloads. */
          balls: z.number().int().nonnegative().optional(),
          strikes: z.number().int().nonnegative().optional(),
        })
        .passthrough()
        .optional(),
    })
    .optional(),
});

export const gcScoreboardResponseSchema = z.object({
  next_update: z.string().optional(),
  data: z.object({
    organization: z.object({
      id: z.string(),
      name: z.string(),
      sport: z.string().optional(),
    }),
    events: z.array(gcEventSchema),
  }),
});

export type GcScoreboardEvent = z.infer<typeof gcEventSchema>;
export type GcScoreboardResponse = z.infer<typeof gcScoreboardResponseSchema>;

export type GcBracketMatchRef = {
  id: string;
  home: string;
  away: string;
  officialGameNumber?: string;
  dateLabel?: string;
  time?: string;
  venue?: string;
  field?: string;
};

export type GcLiveGameStatus = {
  scoreLabel?: string;
  inningLabel?: string;
  statusLabel?: string;
};

export type GcLiveSituation = {
  inningLabel?: string;
  battingSide?: "home" | "away";
  balls?: number;
  strikes?: number;
  outsInHalf?: number;
};

export type GcLiveMatchPayload = {
  liveGameStatuses: Record<string, GcLiveGameStatus>;
  matchEventIds: Record<string, string>;
  /** Full GC event per bracket match id (for single-game scoreboard modal). */
  eventsByMatchId: Record<string, GcScoreboardEvent>;
  /** Enriched live count data from homelab reader (live games only). */
  liveSituationsByMatchId?: Record<string, GcLiveSituation>;
  /** GameChanger organization id for fan URLs. */
  organizationId?: string;
  /** True when any bracket-matched GameChanger game is in progress. */
  hasLiveGames: boolean;
  nextPollMs: number;
};

export type GcAdminLiveResponse = GcLiveMatchPayload & {
  organizationName?: string;
  polledAt?: string;
  importedMatchIds?: string[];
  /** Bracket matches whose GC game newly reached final on this sync. */
  newlyFinalizedMatchIds?: string[];
  specUpdated?: boolean;
};
