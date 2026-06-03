import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { scoreNameMatch } from "@/lib/paypal/parseCsv";
import { verifyPayPalWebhookSignature, extractPayment } from "@/lib/paypal/webhook";

const HANDLED_EVENTS = new Set(["PAYMENT.SALE.COMPLETED", "PAYMENT.CAPTURE.COMPLETED"]);

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

  // Idempotency
  const existing = await prisma.allStarPayment.findFirst({ where: { paypalTxId: txId } });
  if (existing) {
    return NextResponse.json({ skipped: true, reason: "already_synced" });
  }

  if (!note || note.trim().length < 2) {
    return NextResponse.json({ skipped: true, reason: "no_note" });
  }

  // Match against unpaid All-Star players by name in the note
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
