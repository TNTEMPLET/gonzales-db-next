import { NextRequest, NextResponse } from "next/server";

import { ingestShirtCaptureById } from "@/lib/merch/shirtOrderIngest";
import type { PayPalTransaction } from "@/lib/paypal/client";
import { extractPayment, verifyPayPalWebhookSignature } from "@/lib/paypal/webhook";

/**
 * Live shirt ingest. PayPal NCP checkouts fire CAPTURE/SALE (and sometimes CHECKOUT.ORDER.*).
 * Cart details come from capture→order (not lagging Reporting).
 */
const HANDLED_EVENTS = new Set([
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.CAPTURE.COMPLETED",
  "CHECKOUT.ORDER.COMPLETED",
  "CHECKOUT.ORDER.APPROVED",
  "CHECKOUT.ORDER.PROCESSED",
]);

function captureIdFromCheckoutOrder(resource: Record<string, unknown>): string | null {
  const units = resource.purchase_units as
    | Array<{
        payments?: { captures?: Array<{ id?: string; status?: string }> };
      }>
    | undefined;
  if (!Array.isArray(units)) return null;
  for (const u of units) {
    const caps = u.payments?.captures ?? [];
    const done =
      caps.find((c) => (c.status || "").toUpperCase() === "COMPLETED") || caps[0];
    if (done?.id) return done.id;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

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
    console.error("PayPal shirts webhook: invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event_type: string; resource: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.event_type)) {
    return NextResponse.json({
      skipped: true,
      reason: "unhandled_event_type",
      event_type: event.event_type,
    });
  }

  let txId: string | null = null;
  let fallback: Partial<PayPalTransaction> | undefined;

  if (event.event_type.startsWith("CHECKOUT.ORDER.")) {
    txId = captureIdFromCheckoutOrder(event.resource);
    if (!txId) {
      return NextResponse.json({
        skipped: true,
        reason: "no_capture_on_order_yet",
        orderId: (event.resource.id as string | undefined) ?? null,
      });
    }
  } else {
    const payment = extractPayment(event.event_type, event.resource);
    if (!payment?.txId) {
      return NextResponse.json({ skipped: true, reason: "no_tx_id" });
    }
    txId = payment.txId;
    fallback = {
      txDate: payment.txDate,
      payerName: payment.payerName,
      payerEmail: payment.payerEmail,
      amountCents: payment.amountCents,
      note: payment.note,
      itemName: payment.itemName,
      itemQuantity: payment.itemQuantity,
      checkoutNote: null,
      status: "S",
    };
  }

  const ingested = await ingestShirtCaptureById(txId, { fallback });

  if (!ingested.ok) {
    console.info("PayPal shirts webhook skip", ingested.reason, txId, ingested.itemName);
    return NextResponse.json({
      skipped: true,
      reason: ingested.reason,
      itemName: ingested.itemName ?? null,
      txId,
    });
  }

  console.info("PayPal shirts webhook", ingested.result, txId, ingested.tx.itemName);
  return NextResponse.json({
    stored: ingested.result === "created",
    result: ingested.result,
    txId,
    itemName: ingested.tx.itemName,
    amountCents: ingested.tx.amountCents,
  });
}
