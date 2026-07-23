import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { verifyPayPalWebhookSignature } from "@/lib/paypal/webhook";
import { fetchTransactionById } from "@/lib/paypal/client";

const HANDLED_EVENTS = new Set(["PAYMENT.SALE.COMPLETED", "PAYMENT.CAPTURE.COMPLETED"]);

function isShirtOrder(itemName: string | null, gonzalesKw: string, ascensionKw: string): boolean {
  const name = (itemName ?? "").toLowerCase();
  if (gonzalesKw || ascensionKw) {
    return (
      (!!gonzalesKw && name.includes(gonzalesKw.toLowerCase())) ||
      (!!ascensionKw && name.includes(ascensionKw.toLowerCase()))
    );
  }
  return name.includes("shirt") || name.includes("state champ");
}

function resolveOrg(itemName: string | null, gonzalesKw: string, ascensionKw: string): string {
  const name = (itemName ?? "").toLowerCase();
  if (gonzalesKw && name.includes(gonzalesKw.toLowerCase())) return "gonzales";
  if (ascensionKw && name.includes(ascensionKw.toLowerCase())) return "ascension";
  if (name.includes("gonzales") || name.includes("dyb") || name.includes("diamond")) return "gonzales";
  // Ascension LLB buttons often say "AP LL" (not "llb" / full "little league").
  if (
    name.includes("ascension") ||
    name.includes("llb") ||
    name.includes("little league") ||
    name.includes("ap ll") ||
    /\bll\b/.test(name)
  ) {
    return "ascension";
  }
  return "unknown";
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

  const txId = (event.resource.id ?? "") as string;
  if (!txId) return NextResponse.json({ skipped: true, reason: "no_tx_id" });

  const existing = await prisma.shirtOrderRecord.findUnique({ where: { txId } });
  if (existing) return NextResponse.json({ skipped: true, reason: "already_stored" });

  let fullTx: Awaited<ReturnType<typeof fetchTransactionById>> = null;
  try {
    fullTx = await fetchTransactionById(txId);
  } catch {
    return NextResponse.json({ skipped: true, reason: "tx_lookup_failed" });
  }

  if (!fullTx) return NextResponse.json({ skipped: true, reason: "tx_not_found" });

  const gonzalesKw = process.env.PAYPAL_SHIRT_ITEM_GONZALES ?? "";
  const ascensionKw = process.env.PAYPAL_SHIRT_ITEM_ASCENSION ?? "";
  // Gonzales 11U DYB State Champs Shirt NCP button is $15.00 (Z5HW3TUQFBYWE).
  const shirtPriceCents = parseInt(process.env.PAYPAL_SHIRT_PRICE_CENTS ?? "1500", 10);

  if (!isShirtOrder(fullTx.itemName, gonzalesKw, ascensionKw)) {
    return NextResponse.json({ skipped: true, reason: "not_a_shirt_order", itemName: fullTx.itemName });
  }

  const org = resolveOrg(fullTx.itemName, gonzalesKw, ascensionKw);
  const quantity = fullTx.itemQuantity ?? Math.max(1, Math.round(fullTx.amountCents / shirtPriceCents));

  await prisma.shirtOrderRecord.create({
    data: {
      txId,
      org,
      payerName: fullTx.payerName,
      payerEmail: fullTx.payerEmail,
      amountCents: fullTx.amountCents,
      quantity,
      note: fullTx.checkoutNote ?? fullTx.note,
      itemName: fullTx.itemName,
      txDate: fullTx.txDate,
      items: {
        create: Array.from({ length: quantity }, (_, i) => ({ seq: i + 1 })),
      },
    },
  });

  return NextResponse.json({ stored: true, org, quantity, txId });
}
