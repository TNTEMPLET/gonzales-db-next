import "server-only";

import { randomBytes } from "crypto";

import { getMerchProductById } from "@/lib/merch/catalog";
import {
  applyMerchStatusOverride,
  isMerchProductOpenNow,
  loadMerchStatusOverrides,
} from "@/lib/merch/productStatus";
import {
  buildShirtCheckoutNote,
  SHIRT_SIZE_OPTIONS,
} from "@/lib/merch/shirtSizeOptions";
import prisma from "@/lib/prisma";
import type { ContentOrgId } from "@/lib/siteConfig";
import { isContentOrgId } from "@/lib/siteConfig";

/** Public draft code prefix — kept short for PayPal note fields. */
export const MERCH_DRAFT_CODE_PREFIX = "MO-";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const DEFAULT_MAX_QTY = 10;
const DRAFT_TTL_DAYS = 14;

export type MerchDraftStatus =
  | "awaiting_payment"
  | "paid"
  | "expired"
  | "cancelled";

export type CreateMerchDraftInput = {
  org: ContentOrgId;
  productId: string;
  playerName: string;
  sizes: string[];
  contactEmail?: string | null;
  createdByUserId?: string | null;
  createdByEmail?: string | null;
  /** When true, allow closed catalog products (admin test form). */
  allowClosedProduct?: boolean;
};

export type MerchDraftPublic = {
  id: string;
  code: string;
  org: string;
  productId: string;
  productName: string;
  paypalUrl: string;
  playerName: string;
  sizes: string[];
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  contactEmail: string | null;
  checkoutNote: string;
  status: MerchDraftStatus;
  paypalOrderId: string | null;
  paypalTxId: string | null;
  paidAt: string | null;
  createdAt: string;
  expiresAt: string | null;
};

const ALLOWED_SIZES = new Set(SHIRT_SIZE_OPTIONS.map((o) => o.value));

/** Extract first MO-XXXXXX code from a PayPal note / memo. */
export function extractMerchDraftCode(note: string | null | undefined): string | null {
  if (!note) return null;
  const m = note.toUpperCase().match(/\bMO-([A-Z0-9]{4,10})\b/);
  if (!m) return null;
  return `${MERCH_DRAFT_CODE_PREFIX}${m[1]}`;
}

/** Note parents should paste on PayPal (includes code for matching). */
export function buildDraftCheckoutNote(
  code: string,
  playerName: string,
  sizes: string[],
): string {
  const base = buildShirtCheckoutNote(playerName, sizes);
  const c = code.trim().toUpperCase();
  if (!base) return c;
  // Put code first so matching is robust even if PayPal truncates the tail.
  return `${c} | ${base}`;
}

function generateDraftCode(): string {
  const bytes = randomBytes(5);
  let body = "";
  for (let i = 0; i < 6; i++) {
    body += CODE_ALPHABET[bytes[i % bytes.length]! % CODE_ALPHABET.length];
  }
  return `${MERCH_DRAFT_CODE_PREFIX}${body}`;
}

function parseSizesJson(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x));
  } catch {
    return [];
  }
}

export function toMerchDraftPublic(row: {
  id: string;
  code: string;
  org: string;
  productId: string;
  productName: string;
  paypalUrl: string;
  playerName: string;
  sizesJson: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  contactEmail: string | null;
  checkoutNote: string;
  status: string;
  paypalOrderId?: string | null;
  paypalTxId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
}): MerchDraftPublic {
  return {
    id: row.id,
    code: row.code,
    org: row.org,
    productId: row.productId,
    productName: row.productName,
    paypalUrl: row.paypalUrl,
    playerName: row.playerName,
    sizes: parseSizesJson(row.sizesJson),
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    amountCents: row.amountCents,
    contactEmail: row.contactEmail,
    checkoutNote: row.checkoutNote,
    status: row.status as MerchDraftStatus,
    paypalOrderId: row.paypalOrderId ?? null,
    paypalTxId: row.paypalTxId,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

/** Attach PayPal Orders API id after create (embedded checkout). */
export async function attachPaypalOrderToDraft(input: {
  draftId: string;
  paypalOrderId: string;
}): Promise<MerchDraftPublic> {
  const row = await prisma.merchOrderDraft.update({
    where: { id: input.draftId },
    data: { paypalOrderId: input.paypalOrderId },
  });
  return toMerchDraftPublic(row);
}

/**
 * After embedded capture (or Orders webhook): mark draft paid and ensure a
 * ShirtOrderRecord exists. Idempotent on capture/tx id.
 */
export async function completeMerchDraftFromPayPalCapture(input: {
  /** Draft code (custom_id) and/or PayPal order id. */
  draftCode?: string | null;
  paypalOrderId?: string | null;
  captureId: string;
  amountCents?: number | null;
  payerName?: string | null;
  payerEmail?: string | null;
  txDate?: Date;
}): Promise<{
  ok: boolean;
  reason?: string;
  draft?: MerchDraftPublic;
  shirtOrderId?: string;
  created?: boolean;
}> {
  const captureId = input.captureId?.trim();
  if (!captureId) {
    return { ok: false, reason: "missing_capture_id" };
  }

  try {
    // Already completed for this capture?
    const byTx = await prisma.merchOrderDraft.findUnique({
      where: { paypalTxId: captureId },
    });
    if (byTx) {
      const existingOrder = await prisma.shirtOrderRecord.findUnique({
        where: { txId: captureId },
      });
      return {
        ok: true,
        draft: toMerchDraftPublic(byTx),
        shirtOrderId: existingOrder?.id,
        created: false,
      };
    }

    let draft =
      (input.paypalOrderId
        ? await prisma.merchOrderDraft.findUnique({
            where: { paypalOrderId: input.paypalOrderId },
          })
        : null) ??
      (input.draftCode
        ? await prisma.merchOrderDraft.findUnique({
            where: { code: input.draftCode.trim().toUpperCase() },
          })
        : null);

    // custom_id may be the code without normalizing
    if (!draft && input.draftCode) {
      const code = extractMerchDraftCode(input.draftCode) ?? input.draftCode.trim().toUpperCase();
      draft = await prisma.merchOrderDraft.findUnique({ where: { code } });
    }

    if (!draft) {
      return { ok: false, reason: "draft_not_found" };
    }

    const updated = await prisma.merchOrderDraft.update({
      where: { id: draft.id },
      data: {
        status: "paid",
        paypalTxId: captureId,
        paidAt: input.txDate ?? new Date(),
        ...(input.paypalOrderId && !draft.paypalOrderId
          ? { paypalOrderId: input.paypalOrderId }
          : {}),
        ...(input.payerEmail && !draft.contactEmail
          ? { contactEmail: input.payerEmail.toLowerCase() }
          : {}),
      },
    });

    const existingOrder = await prisma.shirtOrderRecord.findUnique({
      where: { txId: captureId },
    });
    if (existingOrder) {
      return {
        ok: true,
        draft: toMerchDraftPublic(updated),
        shirtOrderId: existingOrder.id,
        created: false,
      };
    }

    const order = await prisma.shirtOrderRecord.create({
      data: {
        txId: captureId,
        org: updated.org,
        payerName: input.payerName ?? null,
        payerEmail: input.payerEmail ?? updated.contactEmail,
        amountCents: input.amountCents ?? updated.amountCents,
        quantity: updated.quantity,
        note: updated.checkoutNote,
        itemName: updated.productName,
        txDate: input.txDate ?? new Date(),
        items: {
          create: Array.from({ length: updated.quantity }, (_, i) => ({
            seq: i + 1,
          })),
        },
      },
    });

    return {
      ok: true,
      draft: toMerchDraftPublic(updated),
      shirtOrderId: order.id,
      created: true,
    };
  } catch (err) {
    console.error("[merch drafts] completeFromCapture failed", err);
    return { ok: false, reason: "error" };
  }
}

export async function createMerchOrderDraft(
  input: CreateMerchDraftInput,
): Promise<MerchDraftPublic> {
  if (!isContentOrgId(input.org)) {
    throw new DraftValidationError("Invalid organization");
  }

  const playerName = input.playerName.trim().replace(/\s+/g, " ");
  if (playerName.length < 2) {
    throw new DraftValidationError("Player name is required");
  }
  if (playerName.length > 80) {
    throw new DraftValidationError("Player name is too long");
  }

  const sizes = input.sizes.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (sizes.length < 1) {
    throw new DraftValidationError("At least one shirt size is required");
  }
  if (sizes.length > DEFAULT_MAX_QTY) {
    throw new DraftValidationError(`Maximum ${DEFAULT_MAX_QTY} shirts per order`);
  }
  for (const s of sizes) {
    if (!ALLOWED_SIZES.has(s)) {
      throw new DraftValidationError(`Invalid size: ${s}`);
    }
  }

  const product = getMerchProductById(input.productId);
  if (!product) {
    throw new DraftValidationError("Unknown product");
  }
  if (!product.orgs.includes(input.org)) {
    throw new DraftValidationError("Product is not available for this organization");
  }
  if (!product.active) {
    throw new DraftValidationError("Product is not available");
  }

  const overrides = await loadMerchStatusOverrides([product.id]);
  const withStatus = applyMerchStatusOverride(product, overrides.get(product.id));
  if (!input.allowClosedProduct && !isMerchProductOpenNow(withStatus)) {
    throw new DraftValidationError("This product is not currently accepting orders");
  }

  const maxQty = Math.min(DEFAULT_MAX_QTY, product.maxQuantity ?? DEFAULT_MAX_QTY);
  if (sizes.length > maxQty) {
    throw new DraftValidationError(`Maximum ${maxQty} shirts for this product`);
  }

  const quantity = sizes.length;
  const unitPriceCents = product.priceCents;
  const amountCents = unitPriceCents * quantity;

  let contactEmail: string | null = null;
  if (input.contactEmail?.trim()) {
    const email = input.contactEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
      throw new DraftValidationError("Invalid contact email");
    }
    contactEmail = email;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DRAFT_TTL_DAYS);

  // Retry on rare code collision.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateDraftCode();
    const checkoutNote = buildDraftCheckoutNote(code, playerName, sizes);
    try {
      const row = await prisma.merchOrderDraft.create({
        data: {
          code,
          org: input.org,
          productId: product.id,
          productName: product.name,
          paypalUrl: product.paypalUrl,
          playerName,
          sizesJson: JSON.stringify(sizes),
          quantity,
          unitPriceCents,
          amountCents,
          contactEmail,
          checkoutNote,
          status: "awaiting_payment",
          createdByUserId: input.createdByUserId ?? null,
          createdByEmail: input.createdByEmail ?? null,
          expiresAt,
        },
      });
      return toMerchDraftPublic(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Unique constraint") || msg.includes("unique")) continue;
      throw err;
    }
  }
  throw new Error("Could not allocate a draft order code");
}

/**
 * If a PayPal note references a draft code, mark it paid and return the
 * structured note/sizes to store on ShirtOrderRecord.
 */
export async function matchAndMarkMerchDraftPaid(input: {
  note: string | null | undefined;
  txId: string;
  amountCents?: number | null;
  payerEmail?: string | null;
}): Promise<{
  matched: boolean;
  draft?: MerchDraftPublic;
  /** Prefer this note on the shirt order (includes code + clean sizes). */
  resolvedNote?: string;
  quantity?: number;
  org?: string;
}> {
  const code = extractMerchDraftCode(input.note);
  if (!code) return { matched: false };

  try {
    const existingTx = await prisma.merchOrderDraft.findUnique({
      where: { paypalTxId: input.txId },
    });
    if (existingTx) {
      return {
        matched: true,
        draft: toMerchDraftPublic(existingTx),
        resolvedNote: existingTx.checkoutNote,
        quantity: existingTx.quantity,
        org: existingTx.org,
      };
    }

    const draft = await prisma.merchOrderDraft.findUnique({ where: { code } });
    if (!draft) return { matched: false };

    if (draft.status === "paid" && draft.paypalTxId && draft.paypalTxId !== input.txId) {
      // Code already tied to another payment — still use structured note for this txn.
      return {
        matched: true,
        draft: toMerchDraftPublic(draft),
        resolvedNote: draft.checkoutNote,
        quantity: draft.quantity,
        org: draft.org,
      };
    }

    if (draft.status === "cancelled" || draft.status === "expired") {
      return {
        matched: true,
        draft: toMerchDraftPublic(draft),
        resolvedNote: draft.checkoutNote,
        quantity: draft.quantity,
        org: draft.org,
      };
    }

    const updated = await prisma.merchOrderDraft.update({
      where: { id: draft.id },
      data: {
        status: "paid",
        paypalTxId: input.txId,
        paidAt: new Date(),
        ...(input.payerEmail && !draft.contactEmail
          ? { contactEmail: input.payerEmail }
          : {}),
      },
    });

    return {
      matched: true,
      draft: toMerchDraftPublic(updated),
      resolvedNote: updated.checkoutNote,
      quantity: updated.quantity,
      org: updated.org,
    };
  } catch (err) {
    console.error("[merch drafts] match failed", err);
    return { matched: false };
  }
}

/**
 * Prefer draft-backed note/qty/org when creating a shirt order from PayPal.
 */
export async function resolveShirtOrderFromDraft(input: {
  note: string | null | undefined;
  txId: string;
  amountCents: number;
  payerEmail?: string | null;
  fallbackQuantity: number;
  fallbackOrg: string;
}): Promise<{
  note: string | null;
  quantity: number;
  org: string;
  draftCode: string | null;
}> {
  const match = await matchAndMarkMerchDraftPaid({
    note: input.note,
    txId: input.txId,
    amountCents: input.amountCents,
    payerEmail: input.payerEmail,
  });

  if (!match.matched || !match.draft) {
    return {
      note: input.note ?? null,
      quantity: input.fallbackQuantity,
      org: input.fallbackOrg,
      draftCode: null,
    };
  }

  // Prefer structured draft quantity when PayPal qty is missing/wrong.
  const quantity =
    match.quantity && match.quantity > 0 ? match.quantity : input.fallbackQuantity;
  const org =
    match.org && match.org !== "unknown" ? match.org : input.fallbackOrg;

  return {
    note: match.resolvedNote ?? input.note ?? null,
    quantity,
    org,
    draftCode: match.draft.code,
  };
}

export class DraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftValidationError";
  }
}
