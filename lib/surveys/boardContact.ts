export const BOARD_CONTACT_METHODS = ["PHONE", "TEXT", "EMAIL", "EITHER"] as const;
export type BoardContactMethod = (typeof BOARD_CONTACT_METHODS)[number];

export const BOARD_CONTACT_TIMES = ["MORNING", "AFTERNOON", "EVENING", "ANYTIME"] as const;
export type BoardContactTime = (typeof BOARD_CONTACT_TIMES)[number];

export const BOARD_CONTACT_METHOD_LABELS: Record<BoardContactMethod, string> = {
  PHONE: "Phone call",
  TEXT: "Text message",
  EMAIL: "Email",
  EITHER: "Any of these",
};

export const BOARD_CONTACT_TIME_LABELS: Record<BoardContactTime, string> = {
  MORNING: "Morning (8am–noon)",
  AFTERNOON: "Afternoon (noon–5pm)",
  EVENING: "Evening (5pm–8pm)",
  ANYTIME: "Anytime",
};

export function isBoardContactMethod(value: unknown): value is BoardContactMethod {
  return typeof value === "string" && (BOARD_CONTACT_METHODS as readonly string[]).includes(value);
}

export function isBoardContactTime(value: unknown): value is BoardContactTime {
  return typeof value === "string" && (BOARD_CONTACT_TIMES as readonly string[]).includes(value);
}

export function boardContactMethodLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return isBoardContactMethod(value) ? BOARD_CONTACT_METHOD_LABELS[value] : value;
}

export function boardContactTimeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return isBoardContactTime(value) ? BOARD_CONTACT_TIME_LABELS[value] : value;
}

export type BoardContactInput = {
  wantsBoardContact: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
  email?: string | null;
  preferredMethod?: string | null;
  bestTime?: string | null;
};

export type BoardContactValidation =
  | { ok: true; contactName: string; contactPhone: string; email: string; preferredMethod: BoardContactMethod; bestTime: BoardContactTime }
  | { ok: false; error: string };

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** When the family opts in, name, phone, email, method, and time are all required. */
export function validateBoardContact(input: BoardContactInput): BoardContactValidation | { ok: true; skipped: true } {
  if (!input.wantsBoardContact) return { ok: true, skipped: true };

  const contactName = (input.contactName ?? "").trim();
  const contactPhone = (input.contactPhone ?? "").trim();
  const email = (input.email ?? "").trim();
  const preferredMethod = input.preferredMethod;
  const bestTime = input.bestTime;

  if (contactName.length < 2) {
    return { ok: false, error: "Please enter your full name so the board knows who to ask for." };
  }
  if (contactPhone.length < 7) {
    return { ok: false, error: "Please enter a phone number so the board can reach you." };
  }
  if (!looksLikeEmail(email)) {
    return { ok: false, error: "Please enter a valid email address so the board can reach you." };
  }
  if (!isBoardContactMethod(preferredMethod)) {
    return { ok: false, error: "Please choose a preferred contact method." };
  }
  if (!isBoardContactTime(bestTime)) {
    return { ok: false, error: "Please choose the best time to contact you." };
  }

  return { ok: true, contactName, contactPhone, email, preferredMethod, bestTime };
}
