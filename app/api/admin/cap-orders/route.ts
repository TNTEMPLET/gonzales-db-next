import { NextRequest, NextResponse } from "next/server";
import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { fetchRecentPayPalTransactions } from "@/lib/paypal/client";
import prisma from "@/lib/prisma";

export type CapOrderItem = {
  id: string;
  seq: number;
  status: "open" | "fulfilled";
  fulfilledAt: string | null;
};

export type CapOrder = {
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
  items: CapOrderItem[];
};

export type CapOrdersResponse = {
  gonzales: CapOrder[];
  ascension: CapOrder[];
  unknown: CapOrder[];
  fetchedAt: string;
  configured: boolean;
};

function isCapOrderItem(itemName: string | null, gKw: string, aKw: string): boolean {
  const name = (itemName ?? "").toLowerCase();
  if (gKw || aKw) {
    return (!!gKw && name.includes(gKw.toLowerCase())) || (!!aKw && name.includes(aKw.toLowerCase()));
  }
  return name.includes("cap");
}

function resolveOrg(itemName: string | null, gKw: string, aKw: string): string {
  const name = (itemName ?? "").toLowerCase();
  if (gKw && name.includes(gKw.toLowerCase())) return "gonzales";
  if (aKw && name.includes(aKw.toLowerCase())) return "ascension";
  return "unknown";
}

// ── GET — load from DB ────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const gonzalesKw = process.env.PAYPAL_CAP_ITEM_GONZALES ?? "";
  const ascensionKw = process.env.PAYPAL_CAP_ITEM_ASCENSION ?? "";

  const records = await prisma.capOrderRecord.findMany({
    include: { items: { orderBy: { seq: "asc" } } },
    orderBy: { txDate: "desc" },
  });

  const gonzales: CapOrder[] = [];
  const ascension: CapOrder[] = [];
  const unknown: CapOrder[] = [];

  for (const r of records) {
    const order: CapOrder = {
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
        fulfilledAt: i.fulfilledAt?.toISOString() ?? null,
      })),
    };
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
  } satisfies CapOrdersResponse);
}

// ── POST — sync from PayPal, upsert into DB ───────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const gonzalesKw = process.env.PAYPAL_CAP_ITEM_GONZALES ?? "";
  const ascensionKw = process.env.PAYPAL_CAP_ITEM_ASCENSION ?? "";
  const capPriceCents = parseInt(process.env.PAYPAL_CAP_PRICE_CENTS ?? "2000", 10);

  const url = new URL(request.url);
  const daysBack = Math.min(180, Math.max(7, parseInt(url.searchParams.get("days") ?? "90", 10)));

  let rawTransactions;
  try {
    rawTransactions = await fetchRecentPayPalTransactions(daysBack);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PayPal fetch failed" },
      { status: 502 },
    );
  }

  const completed = rawTransactions.filter((tx) => ["S", "P"].includes(tx.status));
  const capTx = completed.filter((tx) => isCapOrderItem(tx.itemName, gonzalesKw, ascensionKw));

  let created = 0;
  let skipped = 0;

  for (const tx of capTx) {
    const existing = await prisma.capOrderRecord.findUnique({ where: { txId: tx.txId } });
    if (existing) { skipped++; continue; }

    const org = resolveOrg(tx.itemName, gonzalesKw, ascensionKw);
    const quantity = tx.itemQuantity ?? Math.max(1, Math.round(tx.amountCents / capPriceCents));

    await prisma.capOrderRecord.create({
      data: {
        txId: tx.txId,
        org,
        payerName: tx.payerName,
        payerEmail: tx.payerEmail,
        amountCents: tx.amountCents,
        quantity,
        note: tx.checkoutNote ?? tx.note,
        itemName: tx.itemName,
        txDate: tx.txDate,
        items: {
          create: Array.from({ length: quantity }, (_, i) => ({ seq: i + 1 })),
        },
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped, total: capTx.length });
}

// ── PATCH — toggle a single cap item's status ─────────────────────────────────
export async function PATCH(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as { itemId?: string; status?: "open" | "fulfilled" };
  if (!body.itemId || !body.status) {
    return NextResponse.json({ error: "itemId and status required" }, { status: 400 });
  }

  const updated = await prisma.capOrderItem.update({
    where: { id: body.itemId },
    data: {
      status: body.status,
      fulfilledAt: body.status === "fulfilled" ? new Date() : null,
    },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    fulfilledAt: updated.fulfilledAt?.toISOString() ?? null,
  });
}
