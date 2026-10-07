export type ScoutSaveFeedback = {
  tone: "ok" | "error";
  text: string;
};

const feedbackByTicket = new Map<string, ScoutSaveFeedback>();

/** Survives a tickets-page refresh that remounts the editor. */
export function rememberScoutSaveFeedback(ticketId: string, feedback: ScoutSaveFeedback | null): void {
  if (!feedback) feedbackByTicket.delete(ticketId);
  else feedbackByTicket.set(ticketId, feedback);
}

export function readScoutSaveFeedback(ticketId: string): ScoutSaveFeedback | null {
  return feedbackByTicket.get(ticketId) ?? null;
}
