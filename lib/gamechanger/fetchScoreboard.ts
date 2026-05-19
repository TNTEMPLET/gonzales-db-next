import {
  gcScoreboardResponseSchema,
  type GcScoreboardEvent,
  type GcScoreboardResponse,
} from "@/lib/gamechanger/types";

export const GC_SCOREBOARD_API_BASE = "https://api.team-manager.gc.com";

export function scoreboardDayStartIso(date: Date = new Date()): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function scoreboardDayStartIsoOffsetDays(offsetDays: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return scoreboardDayStartIso(d);
}

export async function fetchGameChangerScoreboard(
  widgetId: string,
  start: string,
): Promise<GcScoreboardResponse> {
  const url = new URL(`${GC_SCOREBOARD_API_BASE}/public/widgets/scoreboard/${widgetId}`);
  url.searchParams.set("start", start);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`GameChanger scoreboard request failed (${res.status})`);
  }

  const json: unknown = await res.json();
  const parsed = gcScoreboardResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("GameChanger scoreboard response was not in the expected format.");
  }

  return parsed.data;
}

/** Merge events across multiple days (dedupe by id). Used for team-name discovery in admin. */
export async function fetchGameChangerScoreboardDays(
  widgetId: string,
  dayOffsets: number[],
): Promise<{ response: GcScoreboardResponse; events: GcScoreboardEvent[] }> {
  const starts = [...new Set(dayOffsets)].map((offset) => scoreboardDayStartIsoOffsetDays(offset));
  const responses = await Promise.all(starts.map((start) => fetchGameChangerScoreboard(widgetId, start)));

  const byId = new Map<string, GcScoreboardEvent>();
  for (const res of responses) {
    for (const ev of res.data.events) {
      byId.set(ev.id, ev);
    }
  }

  const events = [...byId.values()].sort((a, b) => Date.parse(a.start_ts) - Date.parse(b.start_ts));
  const latest = responses[responses.length - 1]!;
  return {
    response: { ...latest, data: { ...latest.data, events } },
    events,
  };
}

/** Merge events from today and yesterday (dedupe by id). */
export async function fetchGameChangerScoreboardWindow(widgetId: string): Promise<{
  response: GcScoreboardResponse;
  events: GcScoreboardEvent[];
}> {
  return fetchGameChangerScoreboardDays(widgetId, [-1, 0]);
}

/** Wider window for admin team-name mapping (past two weeks + today). */
export async function fetchGameChangerScoreboardTeamNamesWindow(widgetId: string): Promise<{
  response: GcScoreboardResponse;
  events: GcScoreboardEvent[];
}> {
  const offsets = Array.from({ length: 15 }, (_, i) => i - 14);
  return fetchGameChangerScoreboardDays(widgetId, offsets);
}

export function pollIntervalFromNextUpdate(nextUpdate: string | undefined): number {
  const MIN_MS = 15_000;
  const MAX_MS = 60_000;
  const DEFAULT_MS = 30_000;

  if (!nextUpdate) return DEFAULT_MS;
  const target = Date.parse(nextUpdate);
  if (!Number.isFinite(target)) return DEFAULT_MS;
  const delta = target - Date.now();
  if (delta <= 0) return MIN_MS;
  return Math.min(MAX_MS, Math.max(MIN_MS, delta));
}
