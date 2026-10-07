import { decodeGmailEntities } from "@/lib/scout/snippet";
import { headerValue, type ScoutHeader } from "@/lib/scout/senderRule";

/**
 * Subject prefixes Google Calendar (and similar clients) put on invites,
 * updates, cancellations, and RSVPs. Matched after Re:/Fwd: prefixes are
 * stripped, and after the prefix boundary (colon, space, or end).
 * "Updated invitation" also covers "Updated invitation with note:".
 */
export const SCOUT_CALENDAR_SUBJECT_PREFIXES = [
  "Invitation:",
  "Updated invitation",
  "Updated invitation with note:",
  "Canceled event",
  "Cancelled event",
  "Accepted:",
  "Declined:",
  "Tentatively accepted:",
  "Invitation from Google Calendar",
] as const;

const REPLY_PREFIX = /^(?:(?:re|fw|fwd)\s*:\s*)+/i;

export type ScoutCalendarDecision = { skip: false } | { skip: true; detail: string };

function normalizeSubject(subject: string): string {
  return decodeGmailEntities(subject).replace(/[\u00a0\s]+/g, " ").trim();
}

/** Subject with leading Re:/Fwd:/Fw: prefixes removed. */
export function scoutCalendarSubjectCore(subject: string): string {
  return normalizeSubject(subject).replace(REPLY_PREFIX, "").trim();
}

export function subjectLooksLikeCalendar(subject: string): boolean {
  const core = scoutCalendarSubjectCore(subject).toLowerCase();
  if (!core) return false;
  return SCOUT_CALENDAR_SUBJECT_PREFIXES.some((prefix) => {
    const needle = prefix.toLowerCase();
    if (!core.startsWith(needle)) return false;
    if (needle.endsWith(":")) return true;
    const next = core.charAt(needle.length);
    return next === "" || next === ":" || next === " " || next === "-" || next === "—";
  });
}

function mediaType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function headerLooksLikeCalendar(headers: readonly ScoutHeader[] | undefined): string | null {
  if (!headers) return null;
  for (const header of headers) {
    const name = header.name.toLowerCase();
    const value = header.value.toLowerCase();
    if (name === "content-type") {
      const mime = mediaType(value);
      if (mime === "text/calendar" || mime === "application/ics" || mime === "text/x-vcalendar") {
        return "content-type";
      }
      continue;
    }
    if (name === "content-class" && value.includes("calendar")) return "content-class";
    if (name.includes("calendar")) return "calendar header";
  }
  const sender = headerValue(headers, "Sender")?.toLowerCase() ?? "";
  if (sender.includes("calendar-notification@google.com") || sender.includes("google calendar")) {
    return "calendar sender";
  }
  return null;
}

/**
 * Stage-1 calendar exclusion. Invites, updates, cancellations, and RSVPs
 * (including replies and forwards of those subjects) never become tickets.
 */
export function evaluateScoutCalendar(input: {
  subject: string;
  headers?: readonly ScoutHeader[];
  hasCalendarPart?: boolean;
}): ScoutCalendarDecision {
  if (input.hasCalendarPart) return { skip: true, detail: "calendar part" };
  if (subjectLooksLikeCalendar(input.subject)) return { skip: true, detail: "subject" };
  const header = headerLooksLikeCalendar(input.headers);
  if (header) return { skip: true, detail: header };
  return { skip: false };
}
