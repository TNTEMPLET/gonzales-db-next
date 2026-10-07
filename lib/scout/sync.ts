import { createScoutClassifyRuntime, type ScoutClassifyRuntime } from "@/lib/scout/classify";
import {
  SCOUT_HISTORY_CURSOR_PREFIX,
  SCOUT_LIST_CURSOR_PREFIX,
  SCOUT_LOOKBACK_DAYS,
  scoutInboxLookbackQuery,
} from "@/lib/scout/config";
import {
  ScoutGmailAccessError,
  ScoutListCursorError,
  type GmailGateway,
} from "@/lib/scout/gmailGateway";
import { ingestParsedMessage, type IngestResult } from "@/lib/scout/ingest";
import { scoutPublicErrorMessage } from "@/lib/scout/storageError";
import type { ScoutStore } from "@/lib/scout/store";

export const SCOUT_ALREADY_RUNNING = "Scout is already running.";

export type ScoutSyncReport = {
  ok: boolean;
  error: string | null;
  created: number;
  appended: number;
  reopened: number;
  skipped: number;
  /** Skip bucket counts for this run. Keys are stable reasons such as calendar or list mail. */
  skipCounts: Record<string, number>;
  /** Messages kept by keyword rules because the model was missing, capped, or failed. */
  fallbackKeeps: number;
  duplicates: number;
  backfillPending: boolean;
};

export function emptyScoutSyncReport(error: string | null = null): ScoutSyncReport {
  return {
    ok: error === null,
    error,
    created: 0,
    appended: 0,
    reopened: 0,
    skipped: 0,
    skipCounts: {},
    fallbackKeeps: 0,
    duplicates: 0,
    backfillPending: false,
  };
}

export function publicSyncError(err: unknown, accessMessage: string): string {
  if (err instanceof ScoutGmailAccessError) return accessMessage;
  return scoutPublicErrorMessage(err, "Scout sync failed");
}

function countSkip(report: ScoutSyncReport, reason: string) {
  report.skipped += 1;
  const bucket = reason || "skipped";
  report.skipCounts[bucket] = (report.skipCounts[bucket] ?? 0) + 1;
}

function countResult(report: ScoutSyncReport, result: IngestResult) {
  if (result.type === "created") {
    report.created += 1;
    if (result.viaFallback) report.fallbackKeeps += 1;
  } else if (result.type === "appended") {
    report.appended += 1;
    if (result.reopened) report.reopened += 1;
    if (result.viaFallback) report.fallbackKeeps += 1;
  } else if (result.type === "skipped") countSkip(report, result.reason);
  else report.duplicates += 1;
}

type ParsedCursor =
  | { kind: "list"; pageToken: string | null }
  | { kind: "history"; pageToken: string | null }
  | { kind: "none" };

function parseCursor(cursor: string | null): ParsedCursor {
  if (cursor?.startsWith(SCOUT_LIST_CURSOR_PREFIX)) {
    const token = cursor.slice(SCOUT_LIST_CURSOR_PREFIX.length);
    return { kind: "list", pageToken: token || null };
  }
  if (cursor?.startsWith(SCOUT_HISTORY_CURSOR_PREFIX)) {
    const token = cursor.slice(SCOUT_HISTORY_CURSOR_PREFIX.length);
    return { kind: "history", pageToken: token || null };
  }
  return { kind: "none" };
}

async function ingestIds(
  store: ScoutStore,
  gateway: GmailGateway,
  mailbox: string,
  ids: { id: string }[],
  report: ScoutSyncReport,
  runtime: ScoutClassifyRuntime,
) {
  for (const item of ids) {
    const parsed = await gateway.getMetadata(item.id);
    if (!parsed) {
      countSkip(report, "missing metadata");
      continue;
    }
    countResult(report, await ingestParsedMessage(store, mailbox, parsed, runtime));
  }
}

/**
 * First run (no history id) records the mailbox history id, then lists the
 * inbox for the lookback window one page at a time. Later runs follow Gmail
 * history one page at a time. Re-running is safe: message ids are unique.
 * A stale or rejected history id lists the inbox again from a new snapshot.
 */
async function runScoutSyncLocked(deps: {
  mailbox: string;
  now: Date;
  gateway: GmailGateway;
  store: ScoutStore;
  lookbackDays?: number;
  classify?: ScoutClassifyRuntime;
}): Promise<ScoutSyncReport> {
  const { mailbox, now, gateway, store } = deps;
  const report = emptyScoutSyncReport();
  const runtime = deps.classify ?? createScoutClassifyRuntime();
  const query = scoutInboxLookbackQuery(deps.lookbackDays ?? SCOUT_LOOKBACK_DAYS);

  const finishFailure = async (error: string) => {
    report.ok = false;
    report.error = error;
    report.backfillPending = false;
    await store.saveSyncState(mailbox, {
      lastRunAt: now,
      lastError: error,
    });
    return report;
  };

  const succeed = async (
    patch: { lastHistoryId?: string | null; cursor?: string | null },
    backfillPending: boolean,
  ) => {
    await store.saveSyncState(mailbox, {
      lastRunAt: now,
      lastSuccessAt: now,
      lastError: null,
      ...patch,
    });
    report.ok = true;
    report.error = null;
    report.backfillPending = backfillPending;
    return report;
  };

  try {
    const state = await store.getSyncState(mailbox);
    const cursor = parseCursor(state?.cursor ?? null);
    const mode: "history" | "list" = cursor.kind !== "list" && state?.lastHistoryId ? "history" : "list";

    if (mode === "history" && state?.lastHistoryId) {
      const historyPageToken = cursor.kind === "history" ? cursor.pageToken : null;
      const history = await gateway.listHistory(state.lastHistoryId, historyPageToken);
      if (history.ok) {
        await ingestIds(store, gateway, mailbox, history.messages, report, runtime);
        if (history.nextPageToken) {
          return succeed(
            {
              lastHistoryId: state.lastHistoryId,
              cursor: `${SCOUT_HISTORY_CURSOR_PREFIX}${history.nextPageToken}`,
            },
            true,
          );
        }
        return succeed({ lastHistoryId: history.historyId, cursor: null }, false);
      }
      if (!history.expired) return finishFailure(history.message);
    }

    const resumingList = cursor.kind === "list" && Boolean(state?.lastHistoryId);
    const pageToken = resumingList && cursor.kind === "list" ? cursor.pageToken : null;
    const backfillHistoryId = resumingList
      ? (state?.lastHistoryId ?? null)
      : await gateway.currentHistoryId();
    if (!backfillHistoryId) throw new Error("Gmail request failed (profile)");

    let page;
    try {
      page = await gateway.listInboxPage({ query, pageToken });
    } catch (err) {
      if (!(err instanceof ScoutListCursorError) || !pageToken) throw err;
      page = await gateway.listInboxPage({ query, pageToken: null });
    }
    await ingestIds(store, gateway, mailbox, page.messages, report, runtime);

    if (page.nextPageToken) {
      return succeed(
        {
          lastHistoryId: backfillHistoryId,
          cursor: `${SCOUT_LIST_CURSOR_PREFIX}${page.nextPageToken}`,
        },
        true,
      );
    }

    return succeed({ lastHistoryId: backfillHistoryId, cursor: null }, false);
  } catch (err) {
    const message = publicSyncError(err, err instanceof ScoutGmailAccessError ? err.message : "Scout sync failed");
    try {
      return await finishFailure(message);
    } catch {
      report.ok = false;
      report.error = message;
      return report;
    }
  }
}

export async function executeScoutSync(deps: {
  mailbox: string;
  now: Date;
  gateway: GmailGateway;
  store: ScoutStore;
  lookbackDays?: number;
  classify?: ScoutClassifyRuntime;
}): Promise<ScoutSyncReport> {
  const lease = await deps.store.tryAcquireLease(deps.mailbox, deps.now);
  if (!lease) return emptyScoutSyncReport(SCOUT_ALREADY_RUNNING);
  try {
    return await runScoutSyncLocked(deps);
  } finally {
    try {
      await deps.store.releaseLease(deps.mailbox, lease.token);
    } catch {
      // A crashed release expires on its own. The next run can take the lease.
    }
  }
}
