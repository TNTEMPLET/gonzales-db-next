import { z } from "zod";

export const bracketGameChangerSchema = z.object({
  widgetId: z.string().uuid(),
  maxVerticalGamesVisible: z.number().int().min(1).max(20).optional(),
  layout: z.enum(["vertical", "horizontal"]).optional(),
  /** When true (default), final GC games auto-import into the bracket on admin poll. */
  autoImportFinalScores: z.boolean().optional(),
  /** GC event IDs already imported so finals are not applied twice. */
  importedFinalEventIds: z.array(z.string().uuid()).optional(),
});

export type BracketGameChanger = z.infer<typeof bracketGameChangerSchema>;

const gcTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number().optional(),
  is_video_live: z.boolean().optional(),
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
        })
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
};

export type GcLiveGameStatus = {
  scoreLabel?: string;
  inningLabel?: string;
  statusLabel?: string;
};

export type GcLiveMatchPayload = {
  liveGameStatuses: Record<string, GcLiveGameStatus>;
  matchEventIds: Record<string, string>;
  /** Full GC event per bracket match id (for single-game scoreboard modal). */
  eventsByMatchId: Record<string, GcScoreboardEvent>;
  /** True when any bracket-matched GameChanger game is in progress. */
  hasLiveGames: boolean;
  nextPollMs: number;
};

export type GcAdminLiveResponse = GcLiveMatchPayload & {
  organizationName?: string;
  polledAt?: string;
  importedMatchIds?: string[];
  specUpdated?: boolean;
};
