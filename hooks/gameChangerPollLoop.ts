/** Ms to wait after live games end before one follow-up poll (admin auto-import finals). */
export const GC_POST_LIVE_FOLLOWUP_MS = 12_000;

export type GcPollScheduleInput = {
  hasLiveGames: boolean;
  nextPollMs: number;
  hadLiveGames: boolean;
  postLiveFollowUpPending: boolean;
};

export type GcPollScheduleResult = {
  /** When null, stop the poll loop until tab focus or manual refresh. */
  delayMs: number | null;
  hadLiveGames: boolean;
  postLiveFollowUpPending: boolean;
};

/**
 * While any matched game is live in GameChanger, poll at the suggested interval.
 * When idle, stop polling. If we were live and just went idle, schedule one follow-up
 * (so admin can auto-import a game that just went final).
 */
export function scheduleNextGcPoll(input: GcPollScheduleInput): GcPollScheduleResult {
  const { hasLiveGames, nextPollMs, hadLiveGames, postLiveFollowUpPending } = input;

  if (hasLiveGames) {
    const delayMs = Math.min(60_000, Math.max(15_000, nextPollMs));
    return { delayMs, hadLiveGames: true, postLiveFollowUpPending: false };
  }

  if (hadLiveGames && !postLiveFollowUpPending) {
    return {
      delayMs: GC_POST_LIVE_FOLLOWUP_MS,
      hadLiveGames: false,
      postLiveFollowUpPending: true,
    };
  }

  return { delayMs: null, hadLiveGames: false, postLiveFollowUpPending: false };
}
