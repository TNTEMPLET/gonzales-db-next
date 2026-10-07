import { decodeGmailEntities } from "@/lib/scout/snippet";

/**
 * Keyword fallback for Scout. Tune lists in this file.
 *
 * A message is kept when the subject or decoded snippet asks for a change
 * or a report. Recall is preferred: one listed phrase is enough.
 * Past-tense chatter ("the schedule changed", "thanks for the update") is
 * not a phrase, so it stays out. Obvious FYI courtesy ("please see the
 * attached") is dropped when no change or report phrase is present.
 */

export const SCOUT_REQUEST_PHRASES = [
  "can you",
  "could you",
  "would you",
  "please",
  "need you to",
  "need you",
  "send me",
] as const;

export const SCOUT_CHANGE_PHRASES = [
  "change",
  "update",
  "fix",
  "add",
  "remove",
  "move",
  "correct",
  "adjust",
  "make a change",
  "make changes",
  "needs to be changed",
  "needs to be updated",
  "needs to be fixed",
  "needs to be removed",
  "needs to be corrected",
  "needs to be moved",
  "needs to be added",
  "needs updating",
  "needs changing",
  "needs to change",
] as const;

export const SCOUT_REPORT_PHRASES = [
  "report",
  "list of",
  "how many",
  "breakdown",
  "numbers",
  "pull",
  "export",
] as const;

/** "please …" that is courtesy or an invite, not a work request. */
export const SCOUT_PLEASE_COURTESY_PHRASES = [
  "please see",
  "please find",
  "please join",
  "please rsvp",
  "please save the date",
  "please disregard",
] as const;

/**
 * Spans removed before matching so a buried keyword is not a request.
 * "news report" must not count as a report request.
 */
export const SCOUT_SUPPRESSED_PHRASES = [
  "thanks for the update",
  "thank you for the update",
  "no change",
  "no changes",
  "status update",
  "quick update",
  "just an update",
  "news report",
  "weather report",
] as const;

export type ScoutRequestKind = "change_request" | "report_request" | "other";

export type ScoutKeywordDecision = {
  keep: boolean;
  kind: ScoutRequestKind;
  detail: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegExp(phrase: string): RegExp {
  const body = phrase.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
  return new RegExp(`(^|[^a-z0-9])${body}([^a-z0-9]|$)`, "i");
}

function normalize(value: string): string {
  return decodeGmailEntities(value).replace(/[\u00a0\s]+/g, " ").trim().toLowerCase();
}

function blankPhrases(text: string, phrases: readonly string[]): string {
  let next = text;
  for (const phrase of phrases) {
    next = next.replace(new RegExp(phraseRegExp(phrase).source, "gi"), (match) => " ".repeat(match.length));
  }
  return next;
}

/** Longest match wins. Equal lengths use the earliest span in the text. */
function firstPhrase(text: string, phrases: readonly string[]): string | null {
  let best: { phrase: string; index: number } | null = null;
  for (const phrase of phrases) {
    const match = phraseRegExp(phrase).exec(text);
    if (!match) continue;
    const index = match.index + match[1].length;
    if (
      !best ||
      phrase.length > best.phrase.length ||
      (phrase.length === best.phrase.length && index < best.index)
    ) {
      best = { phrase, index };
    }
  }
  return best?.phrase ?? null;
}

/** Any listed phrase counts. The detail string names the longest, earliest hit. */
export function evaluateScoutRequestText(subject: string, snippet: string): ScoutKeywordDecision {
  const combined = `${normalize(subject)} ${normalize(snippet)}`.trim();
  const text = blankPhrases(combined, SCOUT_SUPPRESSED_PHRASES);
  const change = firstPhrase(text, SCOUT_CHANGE_PHRASES);
  const report = firstPhrase(text, SCOUT_REPORT_PHRASES);
  const request = firstPhrase(text, SCOUT_REQUEST_PHRASES);

  if (change) {
    return { keep: true, kind: "change_request", detail: `change:${change}` };
  }
  if (report) {
    return { keep: true, kind: "report_request", detail: `report:${report}` };
  }
  if (request && request !== "please") {
    return { keep: true, kind: "change_request", detail: `request:${request}` };
  }
  if (request === "please" && !firstPhrase(text, SCOUT_PLEASE_COURTESY_PHRASES)) {
    return { keep: true, kind: "change_request", detail: "request:please" };
  }
  if (request === "please") {
    return { keep: false, kind: "other", detail: "courtesy" };
  }
  return { keep: false, kind: "other", detail: "no request phrase" };
}
