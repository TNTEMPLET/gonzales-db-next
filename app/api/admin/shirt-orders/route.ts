import { NextRequest, NextResponse } from "next/server";
import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import {
  defaultShirtIngestOpts,
  syncShirtOrdersFromReporting,
  upsertShirtTxFromPayPal,
} from "@/lib/merch/shirtOrderIngest";
import { isShirtOrderItem } from "@/lib/merch/shirtOrderMatch";
import { normalizeSizeLabel } from "@/lib/merch/shirtSizes";
import {
  fetchTransactionsByCaptureIds,
  type PayPalTransaction,
} from "@/lib/paypal/client";
import { isPayPalOrdersConfigured } from "@/lib/paypal/orders";
import prisma from "@/lib/prisma";

export type ShirtOrderItem = {
  id: string;
  seq: number;
  status: "open" | "fulfilled";
  sizeLabel: string | null;
  fulfilledAt: string | null;
};

export type ShirtOrder = {
  id: string;
  txId: string;
  txDate: string;
  payerName: string | null;
  payerEmail: string | null;
  amountCents: number;
  quantity: number;
  note: string | null;
  itemName: string | null;
  org: string;
  items: ShirtOrderItem[];
};

export type ShirtOrdersResponse = {
  gonzales: ShirtOrder[];
  ascension: ShirtOrder[];
  unknown: ShirtOrder[];
  fetchedAt: string;
  configured: boolean;
  /** True when PAYPAL_CLIENT_ID + SECRET are present (manual Sync can call Reporting API). */
  paypalApiConfigured: boolean;
};

function mapOrder(r: {
  id: string;
  txId: string;
  txDate: Date;
  payerName: string | null;
  payerEmail: string | null;
  amountCents: number;
  quantity: number;
  note: string | null;
  itemName: string | null;
  org: string;
  items: {
    id: string;
    seq: number;
    status: string;
    sizeLabel: string | null;
    fulfilledAt: Date | null;
  }[];
}): ShirtOrder {
  return {
    id: r.id,
    txId: r.txId,
    txDate: r.txDate.toISOString(),
    payerName: r.payerName,
    payerEmail: r.payerEmail,
    amountCents: r.amountCents,
    quantity: r.quantity,
    note: r.note,
    itemName: r.itemName,
    org: r.org,
    items: r.items.map((i) => ({
      id: i.id,
      seq: i.seq,
      status: i.status as "open" | "fulfilled",
      sizeLabel: i.sizeLabel,
      fulfilledAt: i.fulfilledAt?.toISOString() ?? null,
    })),
  };
}

// ── GET — load from DB ────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const gonzalesKw = process.env.PAYPAL_SHIRT_ITEM_GONZALES ?? "";
  const ascensionKw = process.env.PAYPAL_SHIRT_ITEM_ASCENSION ?? "";

  const records = await prisma.shirtOrderRecord.findMany({
    include: { items: { orderBy: { seq: "asc" } } },
    orderBy: { txDate: "desc" },
  });

  const gonzales: ShirtOrder[] = [];
  const ascension: ShirtOrder[] = [];
  const unknown: ShirtOrder[] = [];

  for (const r of records) {
    const order = mapOrder(r);
    if (r.org === "gonzales") gonzales.push(order);
    else if (r.org === "ascension") ascension.push(order);
    else unknown.push(order);
  }

  return NextResponse.json({
    gonzales,
    ascension,
    unknown,
    fetchedAt: new Date().toISOString(),
    configured: !!(gonzalesKw || ascensionKw),
    paypalApiConfigured: isPayPalOrdersConfigured(),
  } satisfies ShirtOrdersResponse);
}

// ── POST — sync from PayPal, upsert into DB ───────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  if (!isPayPalOrdersConfigured()) {
    return NextResponse.json(
      {
        error:
          "PayPal API credentials are not configured on this app (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET). Sync cannot reach PayPal Reporting.",
      },
      { status: 503 },
    );
  }

  const matchOpts = defaultShirtIngestOpts();
  const url = new URL(request.url);
  const daysBack = Math.min(180, Math.max(7, parseInt(url.searchParams.get("days") ?? "90", 10)));

  // Optional body: { txIds: ["29B48…", …] } — instant capture→order import (bypasses Reporting lag).
  let bodyTxIds: string[] = [];
  try {
    const body = (await request.json()) as { txIds?: unknown };
    if (Array.isArray(body?.txIds)) {
      bodyTxIds = body.txIds
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    // empty body is fine (button Sync)
  }

  if (bodyTxIds.length > 0) {
    let shirtTx: PayPalTransaction[] = [];
    try {
      shirtTx = await fetchTransactionsByCaptureIds(bodyTxIds);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "PayPal capture lookup failed" },
        { status: 502 },
      );
    }
    shirtTx = shirtTx.filter(
      (tx) =>
        isShirtOrderItem(tx.itemName, matchOpts.gonzalesKw, matchOpts.ascensionKw) ||
        (tx.amountCents > 0 &&
          tx.amountCents % matchOpts.shirtPriceCents === 0 &&
          tx.amountCents / matchOpts.shirtPriceCents <= 10),
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

    return NextResponse.json({
      created,
      skipped,
      enriched,
      total: shirtTx.length,
      scanned: bodyTxIds.length,
      daysBack,
      importMode: "txIds",
      missingTxIds: bodyTxIds.filter((id) => !shirtTx.some((t) => t.txId === id)),
      reportingNewestAt: newestTx?.toISOString() ?? null,
      note:
        created > 0
          ? "Imported from PayPal capture/order IDs (bypassed Reporting lag)."
          : "Those transaction IDs were looked up but none were new shirt orders (already stored or not shirt-like).",
    });
  }

  try {
    const result = await syncShirtOrdersFromReporting(daysBack);
    return NextResponse.json({
      ...result,
      importMode: "reporting",
      missingTxIds: [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PayPal fetch failed" },
      { status: 502 },
    );
  }
}

// ── PATCH — fulfill toggle and/or edit size labels ────────────────────────────
export async function PATCH(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: {
    itemId?: string;
    status?: "open" | "fulfilled";
    sizeLabel?: string | null;
    /** Update all item sizes on an order (admin correction after PayPal free-text). */
    orderId?: string;
    sizes?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Bulk size edit for one order
  if (body.orderId && Array.isArray(body.sizes)) {
    const order = await prisma.shirtOrderRecord.findUnique({
      where: { id: body.orderId },
      include: { items: { orderBy: { seq: "asc" } } },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (body.sizes.length !== order.items.length) {
      return NextResponse.json(
        { error: `Expected ${order.items.length} sizes, got ${body.sizes.length}` },
        { status: 400 },
      );
    }

    const normalized = body.sizes.map((s) => {
      const raw = String(s ?? "").trim();
      if (!raw) return null;
      return normalizeSizeLabel(raw) || raw;
    });

    await prisma.$transaction(
      order.items.map((item, i) =>
        prisma.shirtOrderItem.update({
          where: { id: item.id },
          data: { sizeLabel: normalized[i] },
        }),
      ),
    );

    const refreshed = await prisma.shirtOrderRecord.findUnique({
      where: { id: order.id },
      include: { items: { orderBy: { seq: "asc" } } },
    });
    if (!refreshed) {
      return NextResponse.json({ error: "Order not found after update" }, { status: 500 });
    }
    return NextResponse.json({ order: mapOrder(refreshed) });
  }

  if (!body.itemId) {
    return NextResponse.json({ error: "itemId or orderId+sizes required" }, { status: 400 });
  }

  const data: { status?: string; fulfilledAt?: Date | null; sizeLabel?: string | null } = {};
  if (body.status === "open" || body.status === "fulfilled") {
    data.status = body.status;
    data.fulfilledAt = body.status === "fulfilled" ? new Date() : null;
  }
  if (body.sizeLabel !== undefined) {
    const raw = body.sizeLabel === null ? "" : String(body.sizeLabel).trim();
    data.sizeLabel = raw ? normalizeSizeLabel(raw) || raw : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.shirtOrderItem.update({
    where: { id: body.itemId },
    data,
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    sizeLabel: updated.sizeLabel,
    fulfilledAt: updated.fulfilledAt?.toISOString() ?? null,
  });
}
