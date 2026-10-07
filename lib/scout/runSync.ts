import { getDelegatedGmailAccessToken } from "@/lib/google/gmailServiceAccount";
import { GMAIL_ACCESS_NOT_GRANTED_MESSAGE, SCOUT_MAILBOX } from "@/lib/scout/config";
import { createGmailGateway } from "@/lib/scout/gmailGateway";
import { prismaScoutStore } from "@/lib/scout/prismaStore";
import { scoutPublicErrorMessage } from "@/lib/scout/storageError";
import { emptyScoutSyncReport, executeScoutSync, type ScoutSyncReport } from "@/lib/scout/sync";

/** Runs a Scout sync and records the outcome. Does not throw. */
export async function runScoutMailboxSync(now = new Date()): Promise<ScoutSyncReport> {
  try {
    const token = await getDelegatedGmailAccessToken();
    if (!token.ok) {
      await prismaScoutStore.saveSyncState(SCOUT_MAILBOX, {
        lastRunAt: now,
        lastError: token.message,
      });
      return emptyScoutSyncReport(token.message);
    }

    const gateway = createGmailGateway({
      token: token.token,
      accessErrorMessage: GMAIL_ACCESS_NOT_GRANTED_MESSAGE,
    });
    const report = await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now,
      gateway,
      store: prismaScoutStore,
    });
    if (report.ok) {
      console.info("[scout] sync", {
        created: report.created,
        appended: report.appended,
        reopened: report.reopened,
        skipped: report.skipped,
        skipCounts: report.skipCounts,
        fallbackKeeps: report.fallbackKeeps,
        duplicates: report.duplicates,
        backfillPending: report.backfillPending,
      });
    }
    return report;
  } catch (err) {
    const safe = scoutPublicErrorMessage(err, "Scout sync failed");
    try {
      await prismaScoutStore.saveSyncState(SCOUT_MAILBOX, {
        lastRunAt: now,
        lastError: safe,
      });
    } catch (saveErr) {
      console.error("[scout] could not record sync error", saveErr instanceof Error ? saveErr.name : "unknown");
    }
    console.error("[scout] sync failed", err instanceof Error ? err.name : "unknown");
    return emptyScoutSyncReport(safe);
  }
}
