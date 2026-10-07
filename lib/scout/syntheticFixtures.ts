import { scoutGmailThreadUrl, type ScoutOrgTag, type ScoutTicketStatus } from "@/lib/scout/config";

export type SyntheticScoutMessage = {
  gmailMessageId: string;
  senderEmail: string;
  senderName: string;
  hoursAgo: number;
  snippet: string;
};

export type SyntheticScoutTicket = {
  gmailThreadId: string;
  subject: string;
  status: ScoutTicketStatus;
  orgTag: ScoutOrgTag | null;
  notes: string | null;
  messages: SyntheticScoutMessage[];
};

/** Obvious sample data. Not copied from a mailbox. */
export const SYNTHETIC_SCOUT_TICKETS: SyntheticScoutTicket[] = [
  {
    gmailThreadId: "synthetic-scout-thread-alpha",
    subject: "Synthetic request: weekend field report",
    status: "NEW",
    orgTag: null,
    notes: null,
    messages: [
      {
        gmailMessageId: "synthetic-scout-msg-alpha-1",
        senderEmail: "synthetic.sender.alpha@apbaseball.com",
        senderName: "Synthetic Sender Alpha",
        hoursAgo: 6,
        snippet: "Synthetic ticket for interface review. This text was not read from a mailbox.",
      },
    ],
  },
  {
    gmailThreadId: "synthetic-scout-thread-beta",
    subject: "Synthetic request: roster count",
    status: "OPEN",
    orgTag: "gonzales",
    notes: "Synthetic note for the detail view.",
    messages: [
      {
        gmailMessageId: "synthetic-scout-msg-beta-1",
        senderEmail: "synthetic.sender.beta@impact-sports.net",
        senderName: "Synthetic Sender Beta",
        hoursAgo: 30,
        snippet: "Synthetic follow-up sample. No attachment and no message body are stored.",
      },
      {
        gmailMessageId: "synthetic-scout-msg-beta-2",
        senderEmail: "synthetic.sender.beta@impact-sports.net",
        senderName: "Synthetic Sender Beta",
        hoursAgo: 4,
        snippet: "Synthetic second note on the same thread, still not from a mailbox.",
      },
    ],
  },
  {
    gmailThreadId: "synthetic-scout-thread-gamma",
    subject: "Synthetic request: practice time",
    status: "WAITING",
    orgTag: "ascension",
    notes: null,
    messages: [
      {
        gmailMessageId: "synthetic-scout-msg-gamma-1",
        senderEmail: "synthetic.sender.gamma@apbaseball.com",
        senderName: "Synthetic Sender Gamma",
        hoursAgo: 12,
        snippet: "Synthetic waiting ticket so the status filter has something to show.",
      },
    ],
  },
  {
    gmailThreadId: "synthetic-scout-thread-delta",
    subject: "Synthetic request: already handled",
    status: "DONE",
    orgTag: "fallball",
    notes: null,
    messages: [
      {
        gmailMessageId: "synthetic-scout-msg-delta-1",
        senderEmail: "synthetic.sender.delta@apbaseball.com",
        senderName: "Synthetic Sender Delta",
        hoursAgo: 48,
        snippet: "Synthetic done ticket. A newer matching message would reopen it.",
      },
    ],
  },
];

export function syntheticTicketGmailUrl(threadId: string): string {
  return scoutGmailThreadUrl(threadId);
}
