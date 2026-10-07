import {
  SCOUT_LIST_CURSOR_PREFIX,
  SCOUT_LOOKBACK_DAYS,
  scoutInboxLookbackQuery,
} from "@/lib/scout/config";
import { ScoutGmailAccessError, type GmailGateway } from "@/lib/scout/gmailGateway";
import { ingestParsedMessage, type IngestResult } from "@/lib/scout/ingest";
import type { ScoutStore } from "@/lib/scout/store";

export type ScoutSyncReport = {
  ok: boolean;
  error: string | null;
  created: number;
  appended: number;
  reopened: number;
  skipped: number;
  duplicates: number;
};

export function emptyScoutSyncReport(error: string | null = null): ScoutSyncReport {
  return {
    ok: error === null,
    error,
    created: 0,
    appended: 0,
    reopened: 0,
    skipped: 0,
    duplicates: 0,
  };
}

export function publicSyncError(err: unknown, accessMessage: string): string {
  if (err instanceof ScoutGmailAccessError) return accessMessage;
  const raw = err instanceof Error ? err.message : "Scout sync failed";
  const cleaned = raw.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  const oneLine = cleaned.replace(/\s+/g, " ").trim();
  if (!oneLine) return "Scout sync failed";
  return oneLine.slice(0, 300);
}

function countResult(report: ScoutSyncReport, result: IngestResult) {
  if (result.type === "created") report.created += 1;
  else if (result.type === "appended") {
    report.appended += 1;
    if (result.reopened) report.reopened += 1;
  } else if (result.type === "skipped") report.skipped += 1;
  else report.duplicates += 1;
}

function listPageToken(cursor: string | null): string | null | undefined {
  if (cursor === null || !cursor.startsWith(SCOUT_LIST_CURSOR_PREFIX)) return undefined;
  const token = cursor.slice(SCOUT_LIST_CURSOR_PREFIX.length);
  return token || null;
}

async function ingestIds(
  store: ScoutStore,
  gateway: GmailGateway,
  mailbox: string,
  ids: { id: string }[],
  report: ScoutSyncReport,
) {
  for (const item of ids) {
    const parsed = await gateway.getMetadata(item.id);
    if (!parsed) {
      report.skipped += 1;
      continue;
    }
    countResult(report, await ingestParsedMessage(store, mailbox, parsed));
  }
}

/**
 * First run (no history id) lists the inbox for the lookback window, a page at a time.
 * Later runs follow Gmail history. Re-running is safe: message ids are unique.
 */
export async function executeScoutSync(deps: {
  mailbox: string;
  now: Date;
  gateway: GmailGateway;
  store: ScoutStore;
  lookbackDays?: number;
}): Promise<ScoutSyncReport> {
  const { mailbox, now, gateway, store } = deps;
  const report = emptyScoutSyncReport();
  const query = scoutInboxLookbackQuery(deps.lookbackDays ?? SCOUT_LOOKBACK_DAYS);

  const finishFailure = async (error: string, patch?: { lastHistoryId?: string | null; cursor?: string | null }) => {
    report.ok = false;
    report.error = error;
    await store.saveSyncState(mailbox, {
      lastRunAt: now,
      lastError: error,
      ...patch,
    });
    return report;
  };

  try {
    const state = await store.getSyncState(mailbox);
    const resumeList = listPageToken(state?.cursor ?? null);
    let mode: "history" | "list" = resumeList === undefined && state?.lastHistoryId ? "history" : "list";
    let pageToken = resumeList === undefined ? null : resumeList;

    if (mode === "history" && state?.lastHistoryId) {
      const history = await gateway.listHistory(state.lastHistoryId);
      if (history.ok) {
        await ingestIds(store, gateway, mailbox, history.messages, report);
        await store.saveSyncState(mailbox, {
          lastRunAt: now,
          lastSuccessAt: now,
          lastError: null,
          lastHistoryId: history.historyId,
          cursor: null,
        });
        report.ok = true;
        report.error = null;
        return report;
      }
      if (!history.expired) return finishFailure(history.message);
      mode = "list";
      pageToken = null;
    }

    const page = await gateway.listInboxPage({ query, pageToken });
    await ingestIds(store, gateway, mailbox, page.messages, report);

    if (page.nextPageToken) {
      await store.saveSyncState(mailbox, {
        lastRunAt: now,
        lastSuccessAt: now,
        lastError: null,
        cursor: `${SCOUT_LIST_CURSOR_PREFIX}${page.nextPageToken}`,
        ...(mode === "list" && state?.lastHistoryId ? { lastHistoryId: null } : {}),
      });
      report.ok = true;
      report.error = null;
      return report;
    }

    const historyId = await gateway.currentHistoryId();
    await store.saveSyncState(mailbox, {
      lastRunAt: now,
      lastSuccessAt: now,
      lastError: null,
      lastHistoryId: historyId,
      cursor: null,
    });
    report.ok = true;
    report.error = null;
    return report;
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
