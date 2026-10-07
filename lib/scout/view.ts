import type { ScoutOrgTag, ScoutTicketStatus } from "@/lib/scout/config";

export type ScoutTicketListItem = {
  id: string;
  subject: string;
  senderEmail: string;
  senderName: string | null;
  lastMessageAt: string;
  status: ScoutTicketStatus;
  orgTag: ScoutOrgTag | null;
  snippet: string;
};

export type ScoutMessageView = {
  id: string;
  senderEmail: string;
  senderName: string | null;
  receivedAt: string;
  snippet: string;
};

export type ScoutTicketDetail = ScoutTicketListItem & {
  gmailUrl: string;
  notes: string;
  firstMessageAt: string;
  messages: ScoutMessageView[];
};

export type ScoutSyncView = {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  backfillPending: boolean;
};

export type ScoutPageModel = {
  tickets: ScoutTicketListItem[];
  selected: ScoutTicketDetail | null;
  sync: ScoutSyncView;
  attentionCount: number;
  seedAllowed: boolean;
  storageMessage: string | null;
  filters: {
    status: string;
    orgTag: string;
    sender: string;
  };
};
