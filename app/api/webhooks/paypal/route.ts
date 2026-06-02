import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { scoreNameMatch } from "@/lib/paypal/parseCsv";
import { verifyPayPalWebhookSignature, extractPayment } from "@/lib/paypal/webhook";
import { fetchTransactionById } from "@/lib/paypal/client";

const HANDLED_EVENTS = new Set(["PAYMENT.SALE.COMPLETED", "PAYMENT.CAPTURE.COMPLETED"]);

function isCapOrderItem(itemName: string | null, gonzalesKw: string, ascensionKw: string): boolean {
  const name = (itemName ?? "").toLowerCase();
  if (gonzalesKw || ascensionKw) {
    return (
      (!!gonzalesKw && name.includes(gonzalesKw.toLowerCase())) ||
      (!!ascensionKw && name.includes(ascensionKw.toLowerCase()))
    );
  }
  return name.includes("cap");
}

function resolveCapOrg(itemName: string | null, gonzalesKw: string, ascensionKw: string): string {
  const name = (itemName ?? "").toLowerCase();
  if (gonzalesKw && name.includes(gonzalesKw.toLowerCase())) return "gonzales";
  if (ascensionKw && name.includes(ascensionKw.toLowerCase())) return "ascension";
  return "unknown";
}

async function storeCapOrder(
  txId: string,
  amountCents: number,
  txDate: Date,
  itemName: string | null,
  payerName: string | null,
  payerEmail: string | null,
  note: string | null,
  checkoutNote: string | null,
  itemQuantity: number | null,
) {
  const gonzalesKw = process.env.PAYPAL_CAP_ITEM_GONZALES ?? "";
  const ascensionKw = process.env.PAYPAL_CAP_ITEM_ASCENSION ?? "";
  const capPriceCents = parseInt(process.env.PAYPAL_CAP_PRICE_CENTS ?? "2000", 10);

  const org = resolveCapOrg(itemName, gonzalesKw, ascensionKw);
  const quantity = itemQuantity ?? Math.max(1, Math.round(amountCents / capPriceCents));

  const existing = await prisma.capOrderRecord.findUnique({ where: { txId } });
  if (existing) return { created: false };

  await prisma.capOrderRecord.create({
    data: {
      txId,
      org,
      payerName,
      payerEmail,
      amountCents,
      quantity,
      note: checkoutNote ?? note,
      itemName,
      txDate,
      items: {
        create: Array.from({ length: quantity }, (_, i) => ({ seq: i + 1 })),
      },
    },
  });

  return { created: true, org, quantity };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error("PayPal webhook: PAYPAL_WEBHOOK_ID env var not set");
    return NextResponse.json({ error: "PAYPAL_WEBHOOK_ID not configured" }, { status: 500 });
  }

  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((v, k) => { headers[k] = v; });

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
  if (!payment) {
    return NextResponse.json({ skipped: true, reason: "no_tx_id" });
  }

  const { txId, amountCents, note, txDate } = payment;

  // Look up full transaction details to get item name (needed to classify)
  let fullTx: Awaited<ReturnType<typeof fetchTransactionById>> = null;
  try {
    fullTx = await fetchTransactionById(txId);
  } catch {
    // Non-fatal — fall through to AllStar matching
  }

  const gonzalesKw = process.env.PAYPAL_CAP_ITEM_GONZALES ?? "";
  const ascensionKw = process.env.PAYPAL_CAP_ITEM_ASCENSION ?? "";

  // ── Cap order path ────────────────────────────────────────────────────────
  if (fullTx && isCapOrderItem(fullTx.itemName, gonzalesKw, ascensionKw)) {
    const result = await storeCapOrder(
      txId,
      fullTx.amountCents || amountCents,
      txDate,
      fullTx.itemName,
      fullTx.payerName,
      fullTx.payerEmail,
      fullTx.note,
      fullTx.checkoutNote,
      fullTx.itemQuantity,
    );
    return NextResponse.json({ type: "cap_order", ...result });
  }

  // ── All-Star payment path ─────────────────────────────────────────────────
  const alreadySynced = await prisma.allStarPayment.findFirst({ where: { paypalTxId: txId } });
  if (alreadySynced) {
    return NextResponse.json({ skipped: true, reason: "already_synced" });
  }

  if (!note || note.trim().length < 2) {
    return NextResponse.json({ skipped: true, reason: "no_note" });
  }

  const unpaid = await prisma.allStarPayment.findMany({
    where: { isPaid: false },
    select: { id: true, playerFullName: true, amountCents: true },
  });

  const best = unpaid
    .map((p) => ({ ...p, score: scoreNameMatch(note, p.playerFullName) }))
    .filter((p) => p.score >= 0.7)
    .sort((a, b) => b.score - a.score)[0];

  if (!best) {
    return NextResponse.json({ matched: false, reason: "no_match", note });
  }

  await prisma.allStarPayment.update({
    where: { id: best.id },
    data: {
      isPaid: true,
      paidAt: txDate,
      paypalTxId: txId,
      paypalTxDate: txDate,
      paypalNote: note,
      ...(amountCents > 0 ? { amountCents } : {}),
    },
  });

  return NextResponse.json({ matched: true, paymentId: best.id, score: best.score });
}
