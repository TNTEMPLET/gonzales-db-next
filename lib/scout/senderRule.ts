import {
  SCOUT_ALLOWED_SENDER_DOMAINS,
  SCOUT_LIST_LOCAL_PARTS,
  SCOUT_MAILBOX,
} from "@/lib/scout/config";

export type ScoutHeader = {
  name: string;
  value: string;
};

export type ScoutSenderInput = {
  fromEmail: string;
  labelIds?: readonly string[];
  headers?: readonly ScoutHeader[];
};

export type ScoutSenderDecision =
  | { include: true }
  | { include: false; reason: string };

const ALLOWED_DOMAINS = new Set<string>(SCOUT_ALLOWED_SENDER_DOMAINS);
const LIST_LOCAL_PARTS = new Set<string>(SCOUT_LIST_LOCAL_PARTS);

const AUTOMATED_LOCAL =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|mailer-daemon|postmaster|bounce|bounces|notifications?|alerts?|newsletter|mailer|daemon)$/i;

export function headerValue(headers: readonly ScoutHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const header of headers) {
    if (header.name.toLowerCase() !== target) continue;
    const value = header.value.trim();
    if (value) return value;
  }
  return null;
}

function localPart(email: string): string {
  const at = email.lastIndexOf("@");
  const local = at < 0 ? email : email.slice(0, at);
  return (local.split("+")[0] ?? local).toLowerCase();
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1);
}

function isAutomatedAddress(email: string): boolean {
  const local = localPart(email);
  if (AUTOMATED_LOCAL.test(local)) return true;
  return /no[-_.]?reply/i.test(local);
}

/**
 * Pure sender rule for Scout.
 * Includes exact @apbaseball.com and @impact-sports.net senders.
 * Drops the mailbox owner, sent mail, noreply-style addresses, list mail, and
 * messages carrying List-Unsubscribe, List-Id, or Auto-Submitted.
 */
export function evaluateScoutSender(input: ScoutSenderInput): ScoutSenderDecision {
  const email = input.fromEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { include: false, reason: "missing sender" };
  }

  const labels = input.labelIds ?? [];
  if (labels.includes("SENT")) {
    return { include: false, reason: "sent mail" };
  }

  const headers = input.headers;
  if (headerValue(headers, "List-Unsubscribe") || headerValue(headers, "List-Id")) {
    return { include: false, reason: "list mail" };
  }

  const precedence = headerValue(headers, "Precedence")?.toLowerCase();
  if (precedence === "list" || precedence === "bulk" || precedence === "junk") {
    return { include: false, reason: "list mail" };
  }

  const autoSubmitted = headerValue(headers, "Auto-Submitted");
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") {
    return { include: false, reason: "automated sender" };
  }

  if (email === SCOUT_MAILBOX) {
    return { include: false, reason: "mailbox owner" };
  }

  if (LIST_LOCAL_PARTS.has(localPart(email))) {
    return { include: false, reason: "list mail" };
  }

  if (isAutomatedAddress(email)) {
    return { include: false, reason: "automated sender" };
  }

  const domain = domainOf(email);
  if (!domain || !ALLOWED_DOMAINS.has(domain)) {
    return { include: false, reason: "sender domain" };
  }

  return { include: true };
}
