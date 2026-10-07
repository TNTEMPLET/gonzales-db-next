import type { ScoutPlan, TicketSnapshot } from "@/lib/scout/plan";

export type ScoutSyncStateRow = {
  lastHistoryId: string | null;
  cursor: string | null;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
};

export type ScoutSyncPatch = {
  lastRunAt: Date;
  lastSuccessAt?: Date | null;
  lastError?: string | null;
  lastHistoryId?: string | null;
  cursor?: string | null;
};

export type ScoutIngestStore = {
  hasMessage(gmailMessageId: string): Promise<boolean>;
  findTicket(mailbox: string, gmailThreadId: string): Promise<TicketSnapshot | null>;
  insertTicket(input: Extract<ScoutPlan, { type: "create" }>): Promise<"created" | "duplicate">;
  appendTicket(input: Extract<ScoutPlan, { type: "append" }>): Promise<"appended" | "duplicate">;
};

export type ScoutStore = ScoutIngestStore & {
  getSyncState(mailbox: string): Promise<ScoutSyncStateRow | null>;
  saveSyncState(mailbox: string, patch: ScoutSyncPatch): Promise<void>;
};
