/**
 * From identities for Communications campaigns (server).
 * Source of truth: CommunicationFromAddress table (Master Admin CRUD).
 * Fallback: env + built-in seed defaults if the table is empty.
 *
 * Client components must NOT import this file (Prisma). Use fromAddressConstants.
 */

import prisma from "@/lib/prisma";

import {
  DEFAULT_COMMUNICATIONS_FROM,
  FALLBACK_FROM_ADDRESSES,
  extractEmail,
  normalizeFrom,
  validateFromHeader,
} from "./fromAddressConstants";

export {
  DEFAULT_COMMUNICATIONS_FROM,
  FALLBACK_FROM_ADDRESSES,
  extractEmail,
  normalizeFrom,
  validateFromHeader,
  getClientFromAddressOptions,
} from "./fromAddressConstants";

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

function envDefaultFrom(): string | null {
  const env =
    process.env.COMMUNICATIONS_EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "";
  return env || null;
}

async function loadActiveRows(): Promise<FromAddressRow[]> {
  try {
    return await prisma.communicationFromAddress.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  } catch {
    return [];
  }
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
