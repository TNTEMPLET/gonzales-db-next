/** Hard cap for a single EXPLICIT_CONTACTS rule — mirrors EXPLICIT_USERS_MAX. */
export const EXPLICIT_CONTACTS_MAX = 500;

export type RawContactInput = {
  email: string;
  name?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/**
 * Trims/lowercases/validates email format, dedupes by email, and caps at
 * EXPLICIT_CONTACTS_MAX. Used both when persisting a campaign's audience rule
 * (app/api/admin/communications/campaigns/route.ts) and when resolving it
 * (lib/communications/resolver.ts) — same normalization on write and read.
 */
export function normalizeRawContacts(
  input: RawContactInput[] | null | undefined,
): { contacts: RawContactInput[]; rejected: number } {
  const seen = new Set<string>();
  const contacts: RawContactInput[] = [];
  let rejected = 0;

  for (const raw of input || []) {
    const email = (raw?.email || "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) {
      rejected++;
      continue;
    }
    seen.add(email);
    contacts.push({
      email,
      name: raw.name?.trim() || null,
      sourceType: raw.sourceType?.trim() || null,
      sourceId: raw.sourceId?.trim() || null,
    });
    if (contacts.length >= EXPLICIT_CONTACTS_MAX) break;
  }

  return { contacts, rejected };
}
