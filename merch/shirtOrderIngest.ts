import "server-only";

import { resolveShirtOrderFromDraft } from "@/lib/merch/orderDrafts";
import {
  isShirtOrderItem,
  looksLikeShirtAmount,
  resolveShirtOrg,
} from "@/lib/merch/shirtOrderMatch";
import {
  fetchRecentPayPalTransactions,
  fetchTransactionById,
  type PayPalTransaction,
} from "@/lib/paypal/client";
import { isPayPalOrdersConfigured } from "@/lib/paypal/orders";
import prisma from "@/lib/prisma";

export type ShirtIngestOpts = {
  gonzalesKw: string;
  ascensionKw: string;
  shirtPriceCents: number;
};

export function defaultShirtIngestOpts(): ShirtIngestOpts {
  return {
    gonzalesKw: process.env.PAYPAL_SHIRT_ITEM_GONZALES ?? "",
    ascensionKw: process.env.PAYPAL_SHIRT_ITEM_ASCENSION ?? "",
    shirtPriceCents: parseInt(process.env.PAYPAL_SHIRT_PRICE_CENTS ?? "1500", 10),
  };
}

export async function upsertShirtTxFromPayPal(
  tx: PayPalTransaction,
  opts: ShirtIngestOpts,
): Promise<"created" | "skipped" | "enriched"> {
  const { gonzalesKw, ascensionKw, shirtPriceCents } = opts;
  const existing = await prisma.shirtOrderRecord.findUnique({
    where: { txId: tx.txId },
    include: { items: { orderBy: { seq: "asc" } } },
  });

  if (existing) {
    const needsEnrich =
      !existing.itemName ||
      existing.itemName.includes("awaiting PayPal") ||
      (!existing.note && (tx.checkoutNote || tx.note)) ||
      (!existing.payerName && tx.payerName);

    if (needsEnrich && (tx.itemName || tx.checkoutNote || tx.note || tx.payerName)) {
      const fallbackOrg = resolveShirtOrg(tx.itemName ?? existing.itemName, gonzalesKw, ascensionKw);
      const fallbackQuantity =
        tx.itemQuantity ??
        existing.quantity ??
        Math.max(1, Math.round(tx.amountCents / shirtPriceCents));
      const rawNote = tx.checkoutNote ?? tx.note ?? existing.note;
      const resolved = await resolveShirtOrderFromDraft({
        note: rawNote,
        txId: tx.txId,
        amountCents: tx.amountCents || existing.amountCents,
        payerEmail: tx.payerEmail ?? existing.payerEmail,
        fallbackQuantity,
        fallbackOrg,
      });

      await prisma.shirtOrderRecord.update({
        where: { id: existing.id },
        data: {
          org: resolved.org !== "unknown" ? resolved.org : existing.org,
          payerName: tx.payerName ?? existing.payerName,
          payerEmail: tx.payerEmail ?? existing.payerEmail,
          amountCents: tx.amountCents || existing.amountCents,
          quantity: resolved.quantity,
          note: resolved.note ?? existing.note,
          itemName: tx.itemName ?? existing.itemName,
          txDate: tx.txDate ?? existing.txDate,
        },
      });

      const existingLabels = existing.items.map((i) => i.sizeLabel).filter(Boolean);
      const newLabels = resolved.itemCreates.map((i) => i.sizeLabel).filter(Boolean);
      if (newLabels.length > existingLabels.length && resolved.itemCreates.length > 0) {
        await prisma.shirtOrderItem.deleteMany({ where: { orderId: existing.id } });
        await prisma.shirtOrderItem.createMany({
          data: resolved.itemCreates.map((row) => ({
            orderId: existing.id,
            seq: row.seq,
            sizeLabel: row.sizeLabel ?? null,
            status: "open",
          })),
        });
      }
      return "enriched";
    }
    return "skipped";
  }

  const fallbackOrg = resolveShirtOrg(tx.itemName, gonzalesKw, ascensionKw);
  const fallbackQuantity =
    tx.itemQuantity ?? Math.max(1, Math.round(tx.amountCents / shirtPriceCents));
  const rawNote = tx.checkoutNote ?? tx.note;
  const resolved = await resolveShirtOrderFromDraft({
    note: rawNote,
    txId: tx.txId,
    amountCents: tx.amountCents,
    payerEmail: tx.payerEmail,
    fallbackQuantity,
    fallbackOrg,
  });

  await prisma.shirtOrderRecord.create({
    data: {
      txId: tx.txId,
      org: resolved.org,
      payerName: tx.payerName,
      payerEmail: tx.payerEmail,
      amountCents: tx.amountCents,
      quantity: resolved.quantity,
      note: resolved.note,
      itemName: tx.itemName,
      txDate: tx.txDate,
      items: {
        create: resolved.itemCreates,
      },
    },
  });
  return "created";
}

/**
 * Ingest one capture/sale id (webhook path). Uses capture→order, not Reporting lag.
 */
export async function ingestShirtCaptureById(
  txId: string,
  opts?: Partial<ShirtIngestOpts> & {
    /** Webhook payload fallbacks when capture lookup is thin. */
    fallback?: Partial<PayPalTransaction>;
  },
): Promise<
  | { ok: true; result: "created" | "skipped" | "enriched"; tx: PayPalTransaction }
  | { ok: false; reason: string; itemName?: string | null }
> {
  const matchOpts = { ...defaultShirtIngestOpts(), ...opts };
  const existing = await prisma.shirtOrderRecord.findUnique({ where: { txId } });
  // Still try enrich path via upsert when details improve.
  let fullTx: PayPalTransaction | null = null;
  try {
    fullTx = await fetchTransactionById(txId);
  } catch {
    fullTx = null;
  }

  const fb = opts?.fallback;
  const tx: PayPalTransaction = {
    txId,
    txDate: fullTx?.txDate ?? fb?.txDate ?? new Date(),
    payerName: fullTx?.payerName ?? fb?.payerName ?? null,
    payerEmail: fullTx?.payerEmail ?? fb?.payerEmail ?? null,
    amountCents: fullTx?.amountCents || fb?.amountCents || 0,
    note: fullTx?.note ?? fb?.note ?? null,
    itemName: fullTx?.itemName ?? fb?.itemName ?? null,
    itemCode: fullTx?.itemCode ?? fb?.itemCode ?? null,
    itemQuantity: fullTx?.itemQuantity ?? fb?.itemQuantity ?? null,
    checkoutNote: fullTx?.checkoutNote ?? fb?.checkoutNote ?? null,
    status: fullTx?.status || fb?.status || "S",
  };

  const matchesItem = isShirtOrderItem(
    tx.itemName,
    matchOpts.gonzalesKw,
    matchOpts.ascensionKw,
  );
  const matchesAmount = looksLikeShirtAmount(tx.amountCents, matchOpts.shirtPriceCents);
  if (!matchesItem && !matchesAmount) {
    return { ok: false, reason: "not_a_shirt_order", itemName: tx.itemName };
  }

  // Provisional label when we only know $15 multiples
  if (!tx.itemName && matchesAmount) {
    tx.itemName = "Shirt order (awaiting PayPal details)";
  }

  if (existing && !matchesItem && !tx.checkoutNote && !tx.note) {
    return { ok: true, result: "skipped", tx };
  }

  const result = await upsertShirtTxFromPayPal(tx, matchOpts);
  return { ok: true, result, tx };
}

export type ReportingSyncResult = {
  created: number;
  skipped: number;
  enriched: number;
  total: number;
  scanned: number;
  daysBack: number;
  reportingNewestAt: string | null;
  note: string | null;
};

/**
 * Pull shirt rows from PayPal Transaction Search (Reporting) and upsert.
 * Often lags Activity by hours — pair with webhooks + capture import.
 */
export async function syncShirtOrdersFromReporting(
  daysBack = 14,
): Promise<ReportingSyncResult> {
  if (!isPayPalOrdersConfigured()) {
    throw new Error("PayPal API credentials not configured");
  }

  const matchOpts = defaultShirtIngestOpts();
  const clamped = Math.min(180, Math.max(1, daysBack));
  const raw = await fetchRecentPayPalTransactions(clamped);
  const completed = raw.filter((tx) => ["S", "P"].includes(tx.status));
  const shirtTx = completed.filter((tx) =>
    isShirtOrderItem(tx.itemName, matchOpts.gonzalesKw, matchOpts.ascensionKw),
  );

  let created = 0;
  let skipped = 0;
  let enriched = 0;
  for (const tx of shirtTx) {
    const result = await upsertShirtTxFromPayPal(tx, matchOpts);
    if (result === "created") created++;
    else if (result === "enriched") enriched++;
    else skipped++;
  }

  const newestTx = shirtTx.reduce<Date | null>((max, tx) => {
    if (!max || tx.txDate > max) return tx.txDate;
    return max;
  }, null);

  const note =
    created === 0 && shirtTx.length === 0
      ? "No shirt-matching rows in PayPal Reporting for this window (Activity UI can be ahead of Reporting)."
      : created === 0 && shirtTx.length > 0
        ? "Reporting shirts already stored or enriched."
        : null;

  return {
    created,
    skipped,
    enriched,
    total: shirtTx.length,
    scanned: completed.length,
    daysBack: clamped,
    reportingNewestAt: newestTx?.toISOString() ?? null,
    note,
  };
}
