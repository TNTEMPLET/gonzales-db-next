import { NextRequest, NextResponse } from "next/server";
import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { resolveShirtOrderFromDraft } from "@/lib/merch/orderDrafts";
import { fetchRecentPayPalTransactions } from "@/lib/paypal/client";
import prisma from "@/lib/prisma";

export type ShirtOrderItem = {
  id: string;
  seq: number;
  status: "open" | "fulfilled";
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
};

function isShirtOrderItem(itemName: string | null, gKw: string, aKw: string): boolean {
  const name = (itemName ?? "").toLowerCase();
  if (gKw || aKw) {
    return (!!gKw && name.includes(gKw.toLowerCase())) || (!!aKw && name.includes(aKw.toLowerCase()));
  }
  // Default keyword when env is not set — avoid matching unrelated PayPal activity.
  return name.includes("shirt") || name.includes("state champ");
}

function resolveOrg(itemName: string | null, gKw: string, aKw: string): string {
  const name = (itemName ?? "").toLowerCase();
  if (gKw && name.includes(gKw.toLowerCase())) return "gonzales";
  if (aKw && name.includes(aKw.toLowerCase())) return "ascension";
  // Prefer Gonzales for DYB championship shirt campaigns when only one keyword is configured.
  if (gKw && !aKw) return "gonzales";
  if (aKw && !gKw) return "ascension";
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
    const order: ShirtOrder = {
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
  } satisfies ShirtOrdersResponse);
}

// ── POST — sync from PayPal, upsert into DB ───────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const gonzalesKw = process.env.PAYPAL_SHIRT_ITEM_GONZALES ?? "";
  const ascensionKw = process.env.PAYPAL_SHIRT_ITEM_ASCENSION ?? "";
  // Gonzales 11U DYB State Champs Shirt NCP button is $15.00 (Z5HW3TUQFBYWE).
  const shirtPriceCents = parseInt(process.env.PAYPAL_SHIRT_PRICE_CENTS ?? "1500", 10);

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
  const shirtTx = completed.filter((tx) => isShirtOrderItem(tx.itemName, gonzalesKw, ascensionKw));

  let created = 0;
  let skipped = 0;

  for (const tx of shirtTx) {
    const existing = await prisma.shirtOrderRecord.findUnique({ where: { txId: tx.txId } });
    if (existing) {
      skipped++;
      continue;
    }

    const fallbackOrg = resolveOrg(tx.itemName, gonzalesKw, ascensionKw);
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
          create: Array.from({ length: resolved.quantity }, (_, i) => ({ seq: i + 1 })),
        },
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped, total: shirtTx.length });
}

// ── PATCH — toggle a single shirt item's status ───────────────────────────────
export async function PATCH(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as { itemId?: string; status?: "open" | "fulfilled" };
  if (!body.itemId || !body.status) {
    return NextResponse.json({ error: "itemId and status required" }, { status: 400 });
  }

  const updated = await prisma.shirtOrderItem.update({
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
