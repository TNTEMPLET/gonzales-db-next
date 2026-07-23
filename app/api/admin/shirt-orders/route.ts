import { NextRequest, NextResponse } from "next/server";
import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { resolveShirtOrderFromDraft } from "@/lib/merch/orderDrafts";
import {
  isShirtOrderItem,
  resolveShirtOrg,
} from "@/lib/merch/shirtOrderMatch";
import { normalizeSizeLabel } from "@/lib/merch/shirtSizes";
import {
  fetchRecentPayPalTransactions,
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

async function upsertShirtTxFromPayPal(
  tx: PayPalTransaction,
  opts: { gonzalesKw: string; ascensionKw: string; shirtPriceCents: number },
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

  const gonzalesKw = process.env.PAYPAL_SHIRT_ITEM_GONZALES ?? "";
  const ascensionKw = process.env.PAYPAL_SHIRT_ITEM_ASCENSION ?? "";
  // Gonzales 11U DYB State Champs Shirt NCP button is $15.00 (Z5HW3TUQFBYWE).
  const shirtPriceCents = parseInt(process.env.PAYPAL_SHIRT_PRICE_CENTS ?? "1500", 10);
  const matchOpts = { gonzalesKw, ascensionKw, shirtPriceCents };

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

  let created = 0;
  let skipped = 0;
  let enriched = 0;
  let shirtTx: PayPalTransaction[] = [];
  let scanned = 0;
  let importMode: "reporting" | "txIds" | "mixed" = "reporting";

  if (bodyTxIds.length > 0) {
    importMode = "txIds";
    try {
      shirtTx = await fetchTransactionsByCaptureIds(bodyTxIds);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "PayPal capture lookup failed" },
        { status: 502 },
      );
    }
    scanned = bodyTxIds.length;
    // Keep shirt-like rows; also keep $15 multiples when item name missing.
    shirtTx = shirtTx.filter(
      (tx) =>
        isShirtOrderItem(tx.itemName, gonzalesKw, ascensionKw) ||
        (tx.amountCents > 0 &&
          tx.amountCents % shirtPriceCents === 0 &&
          tx.amountCents / shirtPriceCents <= 10),
    );
  } else {
    let rawTransactions: PayPalTransaction[];
    try {
      rawTransactions = await fetchRecentPayPalTransactions(daysBack);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "PayPal fetch failed" },
        { status: 502 },
      );
    }

    const completed = rawTransactions.filter((tx) => ["S", "P"].includes(tx.status));
    scanned = completed.length;
    shirtTx = completed.filter((tx) => isShirtOrderItem(tx.itemName, gonzalesKw, ascensionKw));
  }

  for (const tx of shirtTx) {
    const result = await upsertShirtTxFromPayPal(tx, matchOpts);
    if (result === "created") created++;
    else if (result === "enriched") enriched++;
    else skipped++;
  }

  // PayPal Reporting often lags the Activity feed by several hours.
  const newestTx = shirtTx.reduce<Date | null>((max, tx) => {
    if (!max || tx.txDate > max) return tx.txDate;
    return max;
  }, null);

  const lagNote =
    importMode === "txIds"
      ? created > 0
        ? "Imported from PayPal capture/order IDs (bypassed Reporting lag)."
        : "Those transaction IDs were looked up but none were new shirt orders (already stored or not shirt-like)."
      : created === 0 && shirtTx.length > 0
        ? "PayPal Reporting returned these shirt sales (already in reports, or enriched). If you still see newer sales only in the PayPal website Activity feed, paste the transaction IDs or wait for Reporting (often 1–4+ hours)."
        : created === 0 && shirtTx.length === 0
          ? "No shirt-matching transactions in PayPal Reporting for this window. New NCP sales can appear in the PayPal UI before the Reporting API lists them — paste transaction IDs to import instantly."
          : null;

  return NextResponse.json({
    created,
    skipped,
    enriched,
    total: shirtTx.length,
    scanned,
    daysBack,
    importMode,
    missingTxIds:
      importMode === "txIds"
        ? bodyTxIds.filter((id) => !shirtTx.some((t) => t.txId === id))
        : [],
    reportingNewestAt: newestTx?.toISOString() ?? null,
    note: lagNote,
  });
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
