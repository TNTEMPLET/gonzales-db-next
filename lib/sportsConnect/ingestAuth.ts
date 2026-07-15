import type { NextRequest } from "next/server";

/**
 * Machine auth for SportsConnect n8n / automation ingest.
 * Set SPORTS_CONNECT_INGEST_SECRET in Vercel (admin project) and potions credentials.
 * Header: Authorization: Bearer <secret>
 */
export function getSportsConnectIngestSecret(): string | null {
  const secret = process.env.SPORTS_CONNECT_INGEST_SECRET?.trim();
  return secret || null;
}

export function isSportsConnectIngestConfigured(): boolean {
  return Boolean(getSportsConnectIngestSecret());
}

export function bearerTokenFromRequest(request: NextRequest): string | null {
  const h = request.headers.get("authorization");
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim() || null;
}

export function isValidSportsConnectIngestBearer(
  request: NextRequest,
): boolean {
  const secret = getSportsConnectIngestSecret();
  if (!secret) return false;
  const token = bearerTokenFromRequest(request);
  if (!token) return false;
  // Constant-time-ish compare for equal-length secrets.
  if (token.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i += 1) {
    mismatch |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return mismatch === 0;
}
