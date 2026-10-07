import { scoutGmailThreadUrl, type ScoutTicketStatus } from "@/lib/scout/config";
import type { ParsedScoutMessage } from "@/lib/scout/parseGmail";
import { toScoutSnippet, toScoutSubject } from "@/lib/scout/snippet";

export type TicketSnapshot = {
  id: string;
  status: ScoutTicketStatus;
  subject: string;
  senderEmail: string;
  senderName: string | null;
  firstMessageAt: Date;
  lastMessageAt: Date;
  snippet: string;
};

export type PlannedMessage = {
  gmailMessageId: string;
  senderEmail: string;
  senderName: string | null;
  receivedAt: Date;
  snippet: string;
};

export type ScoutPlan =
  | {
      type: "create";
      mailbox: string;
      gmailThreadId: string;
      subject: string;
      senderEmail: string;
      senderName: string | null;
      firstMessageAt: Date;
      lastMessageAt: Date;
      snippet: string;
      gmailUrl: string;
      status: "NEW";
      message: PlannedMessage;
    }
  | {
      type: "append";
      ticketId: string;
      status: ScoutTicketStatus;
      reopened: boolean;
      subject: string;
      senderEmail: string;
      senderName: string | null;
      firstMessageAt: Date;
      lastMessageAt: Date;
      snippet: string;
      message: PlannedMessage;
    };

function plannedMessage(message: ParsedScoutMessage): PlannedMessage {
  return {
    gmailMessageId: message.gmailMessageId,
    senderEmail: message.fromEmail,
    senderName: message.fromName,
    receivedAt: message.receivedAt,
    snippet: toScoutSnippet(message.snippet),
  };
}

/** One inbound Gmail message becomes a new ticket or an update to its thread. */
export function planScoutMessage(
  existing: TicketSnapshot | null,
  mailbox: string,
  message: ParsedScoutMessage,
): ScoutPlan {
  const messageRow = plannedMessage(message);
  const subject = toScoutSubject(message.subject);

  if (!existing) {
    return {
      type: "create",
      mailbox,
      gmailThreadId: message.gmailThreadId,
      subject,
      senderEmail: message.fromEmail,
      senderName: message.fromName,
      firstMessageAt: message.receivedAt,
      lastMessageAt: message.receivedAt,
      snippet: messageRow.snippet,
      gmailUrl: scoutGmailThreadUrl(message.gmailThreadId),
      status: "NEW",
      message: messageRow,
    };
  }

  const received = message.receivedAt.getTime();
  const newer = received > existing.lastMessageAt.getTime();
  const earlier = received < existing.firstMessageAt.getTime();
  const reopened = newer && (existing.status === "DONE" || existing.status === "DISMISSED");

  return {
    type: "append",
    ticketId: existing.id,
    status: reopened ? "OPEN" : existing.status,
    reopened,
    subject: earlier ? subject : existing.subject,
    senderEmail: earlier ? message.fromEmail : existing.senderEmail,
    senderName: earlier ? message.fromName : existing.senderName,
    firstMessageAt: earlier ? message.receivedAt : existing.firstMessageAt,
    lastMessageAt: newer ? message.receivedAt : existing.lastMessageAt,
    snippet: newer ? messageRow.snippet : existing.snippet,
    message: messageRow,
  };
}
