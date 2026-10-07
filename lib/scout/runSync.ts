import { getDelegatedGmailAccessToken } from "@/lib/google/gmailServiceAccount";
import { GMAIL_ACCESS_NOT_GRANTED_MESSAGE, SCOUT_MAILBOX } from "@/lib/scout/config";
import { createGmailGateway } from "@/lib/scout/gmailGateway";
import { prismaScoutStore } from "@/lib/scout/prismaStore";
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
    return await executeScoutSync({
      mailbox: SCOUT_MAILBOX,
      now,
      gateway,
      store: prismaScoutStore,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scout sync failed";
    const safe = message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]").slice(0, 300);
    try {
      await prismaScoutStore.saveSyncState(SCOUT_MAILBOX, {
        lastRunAt: now,
        lastError: safe || "Scout sync failed",
      });
    } catch (saveErr) {
      console.error("[scout] could not record sync error", saveErr instanceof Error ? saveErr.name : "unknown");
    }
    console.error("[scout] sync failed", safe || "Scout sync failed");
    return emptyScoutSyncReport(safe || "Scout sync failed");
  }
}
