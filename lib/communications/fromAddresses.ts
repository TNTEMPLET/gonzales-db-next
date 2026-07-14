/**
 * From identities for Communications campaigns.
 * Source of truth: CommunicationFromAddress table (Master Admin CRUD).
 * Fallback: env + built-in seed defaults if the table is empty.
 */

import prisma from "@/lib/prisma";

export const DEFAULT_COMMUNICATIONS_FROM =
  "AP Baseball <noreply@apbaseball.com>";

/** Used only when DB has no active rows (first boot / empty table). */
export const FALLBACK_FROM_ADDRESSES: readonly string[] = [
  DEFAULT_COMMUNICATIONS_FROM,
  "AP Baseball <communications@apbaseball.com>",
  "AP Baseball Board <apboard@apbaseball.com>",
  "AP Baseball Support <support@apbaseball.com>",
] as const;

export type FromAddressRow = {
  id: string;
  fromHeader: string;
  label: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export function normalizeFrom(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function extractEmail(from: string): string | null {
  const angle = from.match(/<([^>]+)>/);
  const raw = (angle?.[1] || from).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return null;
  return raw;
}

/** Validate shape of a From header (display name optional). */
export function validateFromHeader(value: string): { ok: true; fromHeader: string } | { ok: false; error: string } {
  const fromHeader = normalizeFrom(value);
  if (!fromHeader) return { ok: false, error: "From address is required" };
  if (fromHeader.length > 200) return { ok: false, error: "From address is too long" };
  const email = extractEmail(fromHeader);
  if (!email) {
    return {
      ok: false,
      error: 'Use format: Display Name <email@domain.com> or email@domain.com',
    };
  }
  return { ok: true, fromHeader };
}

function envDefaultFrom(): string | null {
  const env =
    process.env.COMMUNICATIONS_EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "";
  return env || null;
}

async function loadActiveRows(): Promise<FromAddressRow[]> {
  try {
    const rows = await prisma.communicationFromAddress.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows;
  } catch {
    // Table may not exist yet during migrate; fall through
    return [];
  }
}

/** Client bootstrap list when API has not loaded yet. */
export function getClientFromAddressOptions(): string[] {
  return [...FALLBACK_FROM_ADDRESSES];
}

export async function listFromAddressRows(includeInactive = false): Promise<FromAddressRow[]> {
  try {
    return await prisma.communicationFromAddress.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  } catch {
    return [];
  }
}

export async function getDefaultFromAddress(): Promise<string> {
  const env = envDefaultFrom();
  const rows = await loadActiveRows();
  if (rows.length > 0) {
    const def = rows.find((r) => r.isDefault) || rows[0];
    return def.fromHeader;
  }
  return env || DEFAULT_COMMUNICATIONS_FROM;
}

export async function getAllowedFromAddresses(): Promise<string[]> {
  const rows = await loadActiveRows();
  if (rows.length > 0) {
    return rows.map((r) => r.fromHeader);
  }
  // Fallback when empty: env + built-ins (no redeploy path until Master seeds DB)
  const extras = (process.env.COMMUNICATIONS_EMAIL_FROM_OPTIONS || "")
    .split(",")
    .map((s) => normalizeFrom(s))
    .filter(Boolean);
  const ordered = [
    DEFAULT_COMMUNICATIONS_FROM,
    envDefaultFrom() || "",
    ...FALLBACK_FROM_ADDRESSES,
    ...extras,
  ];
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

/**
 * Resolve campaign From. Empty/null → default.
 * Throws if a non-empty value is not on the allowlist.
 */
export async function resolveFromAddress(requested?: string | null): Promise<string> {
  const allowed = await getAllowedFromAddresses();
  const fallback = await getDefaultFromAddress();
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
    `From address is not allowed. Choose a configured sender (default: ${fallback}).`,
  );
}

/** Ensure only one default; pass the id that should be default. */
export async function setDefaultFromAddress(id: string) {
  await prisma.$transaction([
    prisma.communicationFromAddress.updateMany({
      data: { isDefault: false },
    }),
    prisma.communicationFromAddress.update({
      where: { id },
      data: { isDefault: true, isActive: true },
    }),
  ]);
}
