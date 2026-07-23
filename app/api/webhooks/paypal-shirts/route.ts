import { NextRequest, NextResponse } from "next/server";

import { resolveShirtOrderFromDraft } from "@/lib/merch/orderDrafts";
import {
  isShirtOrderItem,
  looksLikeShirtAmount,
  resolveShirtOrg,
} from "@/lib/merch/shirtOrderMatch";
import prisma from "@/lib/prisma";
import { fetchTransactionById } from "@/lib/paypal/client";
import { extractPayment, verifyPayPalWebhookSignature } from "@/lib/paypal/webhook";

const HANDLED_EVENTS = new Set(["PAYMENT.SALE.COMPLETED", "PAYMENT.CAPTURE.COMPLETED"]);

/**
 * Store a shirt order from the best available PayPal payload.
 * Reporting API often lags the activity feed by hours — webhook must not depend on it.
 */
async function storeShirtOrder(input: {
  txId: string;
  amountCents: number;
  txDate: Date;
  payerName: string | null;
  payerEmail: string | null;
  itemName: string | null;
  itemQuantity: number | null;
  note: string | null;
  checkoutNote: string | null;
  gonzalesKw: string;
  ascensionKw: string;
  shirtPriceCents: number;
  /** When item name is unknown, allow $15 multiples as provisional shirt orders. */
  allowAmountHeuristic: boolean;
}): Promise<
  | { stored: true; org: string; quantity: number; provisional: boolean; draftCode: string | null }
  | { stored: false; reason: string; itemName: string | null }
> {
  const hasItem = Boolean(input.itemName?.trim());
  const matchesItem = isShirtOrderItem(input.itemName, input.gonzalesKw, input.ascensionKw);
  const matchesAmount =
    input.allowAmountHeuristic && looksLikeShirtAmount(input.amountCents, input.shirtPriceCents);

  if (!matchesItem && !matchesAmount) {
    return { stored: false, reason: "not_a_shirt_order", itemName: input.itemName };
  }

  const provisional = !matchesItem && matchesAmount;
  const fallbackOrg = resolveShirtOrg(input.itemName, input.gonzalesKw, input.ascensionKw);
  const fallbackQuantity =
    input.itemQuantity ??
    Math.max(1, Math.round(input.amountCents / input.shirtPriceCents));
  const rawNote = input.checkoutNote ?? input.note;
  const resolved = await resolveShirtOrderFromDraft({
    note: rawNote,
    txId: input.txId,
    amountCents: input.amountCents,
    payerEmail: input.payerEmail,
    fallbackQuantity,
    fallbackOrg,
  });

  await prisma.shirtOrderRecord.create({
    data: {
      txId: input.txId,
      org: resolved.org,
      payerName: input.payerName,
      payerEmail: input.payerEmail,
      amountCents: input.amountCents,
      quantity: resolved.quantity,
      note: resolved.note,
      // Mark provisional rows so admin can see they need a later Reporting enrich.
      itemName: input.itemName ?? (provisional ? "Shirt order (awaiting PayPal details)" : null),
      txDate: input.txDate,
      items: {
        create: resolved.itemCreates,
      },
    },
  });

  return {
    stored: true,
    org: resolved.org,
    quantity: resolved.quantity,
    provisional,
    draftCode: resolved.draftCode ?? null,
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Prefer a shirts-specific webhook id; fall back to caps webhook if shared.
  const webhookId =
    process.env.PAYPAL_WEBHOOK_ID_SHIRTS ||
    process.env.PAYPAL_WEBHOOK_ID_CAPS ||
    process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error("PayPal shirts webhook: no PAYPAL_WEBHOOK_ID_SHIRTS/CAPS/ID configured");
    return NextResponse.json({ error: "PayPal webhook id not configured" }, { status: 500 });
  }

  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((v, k) => {
    headers[k] = v;
  });

  const valid = await verifyPayPalWebhookSignature(headers, rawBody, webhookId);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event_type: string; resource: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.event_type)) {
    return NextResponse.json({ skipped: true, reason: "unhandled_event_type" });
  }

  const payment = extractPayment(event.event_type, event.resource);
  if (!payment?.txId) {
    return NextResponse.json({ skipped: true, reason: "no_tx_id" });
  }

  const existing = await prisma.shirtOrderRecord.findUnique({ where: { txId: payment.txId } });
  if (existing) return NextResponse.json({ skipped: true, reason: "already_stored" });

  const gonzalesKw = process.env.PAYPAL_SHIRT_ITEM_GONZALES ?? "";
  const ascensionKw = process.env.PAYPAL_SHIRT_ITEM_ASCENSION ?? "";
  const shirtPriceCents = parseInt(process.env.PAYPAL_SHIRT_PRICE_CENTS ?? "1500", 10);

  // Prefer Reporting API cart details when available (item name + checkout options).
  let fullTx: Awaited<ReturnType<typeof fetchTransactionById>> = null;
  try {
    fullTx = await fetchTransactionById(payment.txId);
  } catch {
    fullTx = null;
  }

  const result = await storeShirtOrder({
    txId: payment.txId,
    amountCents: fullTx?.amountCents ?? payment.amountCents,
    txDate: fullTx?.txDate ?? payment.txDate,
    payerName: fullTx?.payerName ?? payment.payerName,
    payerEmail: fullTx?.payerEmail ?? payment.payerEmail,
    itemName: fullTx?.itemName ?? payment.itemName,
    itemQuantity: fullTx?.itemQuantity ?? payment.itemQuantity,
    note: fullTx?.note ?? payment.note ?? payment.customId,
    checkoutNote: fullTx?.checkoutNote ?? null,
    gonzalesKw,
    ascensionKw,
    shirtPriceCents,
    // Only use $15 heuristic when Reporting has no item yet (common NCP lag).
    allowAmountHeuristic: !fullTx?.itemName,
  });

  if (!result.stored) {
    return NextResponse.json({
      skipped: true,
      reason: result.reason,
      itemName: result.itemName,
    });
  }

  return NextResponse.json({
    stored: true,
    org: result.org,
    quantity: result.quantity,
    txId: payment.txId,
    provisional: result.provisional,
    draftCode: result.draftCode,
    enrichedFromReporting: Boolean(fullTx?.itemName),
  });
}
