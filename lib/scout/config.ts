import { PROTECTED_MASTER_ADMIN_EMAIL } from "@/lib/auth/adminRoles";

/** Inbox Scout reads. Domain-wide delegation impersonates this user. */
export const SCOUT_MAILBOX = PROTECTED_MASTER_ADMIN_EMAIL.toLowerCase();

/** Sender domains that can become tickets. Exact host match, not subdomains. */
export const SCOUT_ALLOWED_SENDER_DOMAINS = ["apbaseball.com", "impact-sports.net"] as const;

/** Local parts treated as group or list mail, on any allowed domain. */
export const SCOUT_LIST_LOCAL_PARTS = ["apboard"] as const;

export const SCOUT_LOOKBACK_DAYS = 14;

export const SCOUT_SYNC_PAGE_SIZE = 25;

export const SCOUT_LIST_CURSOR_PREFIX = "list:";

export const SCOUT_SNIPPET_MAX = 200;

export const SCOUT_SUBJECT_MAX = 300;

export const SCOUT_NOTES_MAX = 4000;

export const SCOUT_TICKET_STATUSES = ["NEW", "OPEN", "WAITING", "DONE", "DISMISSED"] as const;

export type ScoutTicketStatus = (typeof SCOUT_TICKET_STATUSES)[number];

export const SCOUT_ATTENTION_STATUSES = ["NEW", "OPEN"] as const satisfies readonly ScoutTicketStatus[];

export const SCOUT_ORG_TAGS = ["gonzales", "ascension", "fallball", "master"] as const;

export type ScoutOrgTag = (typeof SCOUT_ORG_TAGS)[number];

export const GMAIL_ACCESS_NOT_GRANTED_MESSAGE = "Gmail access not granted yet";

export const SCOUT_GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function scoutGmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`;
}

export function scoutInboxLookbackQuery(days: number = SCOUT_LOOKBACK_DAYS): string {
  return `in:inbox newer_than:${days}d`;
}

export function isScoutTicketStatus(value: string): value is ScoutTicketStatus {
  return (SCOUT_TICKET_STATUSES as readonly string[]).includes(value);
}

export function isScoutOrgTag(value: string): value is ScoutOrgTag {
  return (SCOUT_ORG_TAGS as readonly string[]).includes(value);
}

export const SCOUT_STATUS_LABELS: Record<ScoutTicketStatus, string> = {
  NEW: "New",
  OPEN: "Open",
  WAITING: "Waiting",
  DONE: "Done",
  DISMISSED: "Dismissed",
};

export const SCOUT_ORG_LABELS: Record<ScoutOrgTag, string> = {
  gonzales: "Gonzales",
  ascension: "Ascension",
  fallball: "Fall Ball",
  master: "Master",
};
