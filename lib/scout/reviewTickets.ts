import { classifyScoutMessage, type ScoutClassification, type ScoutClassifyRuntime } from "@/lib/scout/classify";

export type ScoutStoredTicketText = {
  id: string;
  subject: string;
  snippet: string;
  senderEmail: string;
};

/**
 * Dry-run view of a ticket already in the database.
 * Stored rows have no calendar headers, so only the subject can catch an invite.
 */
export async function reviewStoredScoutTicket(
  ticket: ScoutStoredTicketText,
  runtime?: ScoutClassifyRuntime,
): Promise<ScoutClassification & { id: string }> {
  const decision = await classifyScoutMessage(
    {
      gmailMessageId: `review:${ticket.id}`,
      fromEmail: ticket.senderEmail,
      subject: ticket.subject,
      snippet: ticket.snippet,
    },
    runtime,
  );
  return { id: ticket.id, ...decision };
}
