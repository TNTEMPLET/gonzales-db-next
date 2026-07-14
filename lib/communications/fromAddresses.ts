/**
 * Allowed Resend "From" identities for Communications campaigns.
 * Domain must be verified in Resend (apbaseball.com is live).
 */

export const DEFAULT_COMMUNICATIONS_FROM =
  "AP Baseball <noreply@apbaseball.com>";

/** Built-in choices shown in the Communications UI (server still validates). */
export const BUILTIN_FROM_ADDRESSES: readonly string[] = [
  DEFAULT_COMMUNICATIONS_FROM,
  "AP Baseball <communications@apbaseball.com>",
  "AP Baseball Board <board@apbaseball.com>",
  "AP Baseball Support <support@apbaseball.com>",
] as const;

function normalizeFrom(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function extractEmail(from: string): string | null {
  const angle = from.match(/<([^>]+)>/);
  const raw = (angle?.[1] || from).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return null;
  return raw;
}

/** Default From: env override, else AP Baseball noreply. */
export function getDefaultFromAddress(): string {
  const env =
    process.env.COMMUNICATIONS_EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "";
  return env || DEFAULT_COMMUNICATIONS_FROM;
}

/**
 * Full allowlist: builtins + env default + comma-separated COMMUNICATIONS_EMAIL_FROM_OPTIONS.
 */
export function getAllowedFromAddresses(): string[] {
  const extras = (process.env.COMMUNICATIONS_EMAIL_FROM_OPTIONS || "")
    .split(",")
    .map((s) => normalizeFrom(s))
    .filter(Boolean);
  const envDefault = getDefaultFromAddress();
  const ordered = [DEFAULT_COMMUNICATIONS_FROM, envDefault, ...BUILTIN_FROM_ADDRESSES, ...extras];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of ordered) {
    const n = normalizeFrom(item);
    const key = n.toLowerCase();
    if (!n || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/** Client-safe option list (no env): builtins with default first. */
export function getClientFromAddressOptions(): string[] {
  return [...BUILTIN_FROM_ADDRESSES];
}

/**
 * Resolve campaign From. Empty/null → default.
 * Throws if a non-empty value is not on the allowlist (by full string or bare email).
 */
export function resolveFromAddress(requested?: string | null): string {
  const allowed = getAllowedFromAddresses();
  const fallback = getDefaultFromAddress();
  if (!requested || !requested.trim()) return fallback;

  const n = normalizeFrom(requested);
  const exact = allowed.find((a) => a.toLowerCase() === n.toLowerCase());
  if (exact) return exact;

  const email = extractEmail(n);
  if (email) {
    const byEmail = allowed.find((a) => extractEmail(a) === email);
    if (byEmail) return byEmail;
  }

  throw new Error(
    `From address is not allowed. Use one of the configured AP Baseball senders (default: ${DEFAULT_COMMUNICATIONS_FROM}).`,
  );
}
