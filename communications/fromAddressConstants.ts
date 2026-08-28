/**
 * Client-safe From address constants (no Prisma / Node deps).
 * Client components must import only from this module.
 */

export const DEFAULT_COMMUNICATIONS_FROM =
  "AP Baseball <noreply@apbaseball.com>";

/** UI bootstrap only when API has not loaded yet. */
export const FALLBACK_FROM_ADDRESSES: readonly string[] = [
  DEFAULT_COMMUNICATIONS_FROM,
  "AP Baseball <communications@apbaseball.com>",
  "AP Baseball Board <apboard@apbaseball.com>",
  "AP Baseball Support <support@apbaseball.com>",
] as const;

export function normalizeFrom(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function extractEmail(from: string): string | null {
  const angle = from.match(/<([^>]+)>/);
  const raw = (angle?.[1] || from).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return null;
  return raw;
}

export function getClientFromAddressOptions(): string[] {
  return [...FALLBACK_FROM_ADDRESSES];
}

/** Validate shape of a From header (display name optional). */
export function validateFromHeader(
  value: string,
): { ok: true; fromHeader: string } | { ok: false; error: string } {
  const fromHeader = normalizeFrom(value);
  if (!fromHeader) return { ok: false, error: "From address is required" };
  if (fromHeader.length > 200) return { ok: false, error: "From address is too long" };
  const email = extractEmail(fromHeader);
  if (!email) {
    return {
      ok: false,
      error: "Use format: Display Name <email@domain.com> or email@domain.com",
    };
  }
  return { ok: true, fromHeader };
}
