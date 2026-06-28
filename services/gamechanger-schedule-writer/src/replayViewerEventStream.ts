export type ReplayState = {
  balls: number;
  strikes: number;
  outsInHalf: number;
  inning: number;
  half: "top" | "bottom";
};

export type ReplayResult = {
  balls: number;
  strikes: number;
  outsInHalf: number;
  inning: number;
  half: "top" | "bottom";
};

type GcStreamEvent = {
  code?: string;
  events?: GcStreamEvent[];
  attributes?: Record<string, unknown>;
};

function cloneState(state: ReplayState): ReplayState {
  return { ...state };
}

function resetCount(state: ReplayState): void {
  state.balls = 0;
  state.strikes = 0;
}

function advanceHalf(state: ReplayState): void {
  if (state.outsInHalf < 3) return;
  state.outsInHalf = 0;
  if (state.half === "top") {
    state.half = "bottom";
  } else {
    state.half = "top";
    state.inning += 1;
  }
}

function addBall(state: ReplayState): void {
  if (state.balls >= 3) {
    resetCount(state);
    return;
  }
  state.balls += 1;
}

function addStrike(state: ReplayState): void {
  if (state.strikes >= 2) {
    resetCount(state);
    state.outsInHalf += 1;
    advanceHalf(state);
    return;
  }
  state.strikes += 1;
}

function addOut(state: ReplayState): void {
  resetCount(state);
  state.outsInHalf += 1;
  advanceHalf(state);
}

function isOutPlayResult(playResult: string): boolean {
  return playResult.includes("out") || playResult === "batter_out";
}

function applyPitch(state: ReplayState, attrs: Record<string, unknown>): void {
  if (attrs.advancesCount !== true) return;
  const result = typeof attrs.result === "string" ? attrs.result : "";
  if (result === "ball" || result === "intentional_ball") {
    addBall(state);
    return;
  }
  if (result === "strike_swinging" || result === "strike_looking") {
    addStrike(state);
    return;
  }
  if (result === "foul" && state.strikes < 2) {
    state.strikes += 1;
  }
}

function applyBallInPlay(state: ReplayState, attrs: Record<string, unknown>): void {
  resetCount(state);
  const playResult = typeof attrs.playResult === "string" ? attrs.playResult : "";
  if (isOutPlayResult(playResult)) {
    addOut(state);
  }
}

function applyBaseRunning(state: ReplayState, attrs: Record<string, unknown>): void {
  const playType = typeof attrs.playType === "string" ? attrs.playType : "";
  if (playType === "out_on_last_play") {
    addOut(state);
  }
}

function applyStreamEvent(state: ReplayState, event: GcStreamEvent): void {
  if (event.events?.length) {
    for (const nested of event.events) {
      applyStreamEvent(state, nested);
    }
    return;
  }

  const attrs = event.attributes ?? {};
  switch (event.code) {
    case "pitch":
      applyPitch(state, attrs);
      break;
    case "ball_in_play":
      applyBallInPlay(state, attrs);
      break;
    case "base_running":
      applyBaseRunning(state, attrs);
      break;
    case "goto_lineup_index":
      resetCount(state);
      break;
    default:
      break;
  }
}

function parseEventData(raw: unknown): GcStreamEvent | null {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as GcStreamEvent;
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object") {
    return raw as GcStreamEvent;
  }
  return null;
}

type ViewerLiteEntry = {
  event_data?: unknown;
  sequence_number?: number;
};

type ViewerLitePayload = {
  latest_events?: ViewerLiteEntry[];
};

/**
 * Replays GameChanger viewer-payload-lite event streams to derive live count state.
 */
export function replayViewerEventStream(payload: ViewerLitePayload): ReplayResult | null {
  const entries = payload.latest_events;
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const state: ReplayState = {
    balls: 0,
    strikes: 0,
    outsInHalf: 0,
    inning: 1,
    half: "top",
  };

  const snapshots: ReplayState[] = [cloneState(state)];

  for (const entry of entries) {
    const parsed = parseEventData(entry.event_data);
    if (!parsed) continue;

    if (parsed.code === "undo") {
      if (snapshots.length > 1) {
        snapshots.pop();
        const restored = snapshots[snapshots.length - 1]!;
        state.balls = restored.balls;
        state.strikes = restored.strikes;
        state.outsInHalf = restored.outsInHalf;
        state.inning = restored.inning;
        state.half = restored.half;
      }
      continue;
    }

    applyStreamEvent(state, parsed);
    snapshots.push(cloneState(state));
  }

  return {
    balls: state.balls,
    strikes: state.strikes,
    outsInHalf: state.outsInHalf,
    inning: state.inning,
    half: state.half,
  };
}
