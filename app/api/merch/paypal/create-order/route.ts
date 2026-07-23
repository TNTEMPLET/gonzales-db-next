import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { attachPaypalOrderToDraft } from "@/lib/merch/orderDrafts";
import { getShopAccess } from "@/lib/merch/shopAccess";
import { createPayPalOrder, isPayPalOrdersConfigured } from "@/lib/paypal/orders";
import prisma from "@/lib/prisma";

/**
 * Create a PayPal order for an existing merch draft (embedded checkout).
 * Body: { draftId } or { code }
 *
 * One AP Baseball PayPal business account — works on every SITE_ORG deployment
 * that shares the same CLIENT_ID / SECRET.
 */
export async function POST(request: NextRequest) {
  if (!isPayPalOrdersConfigured()) {
    return NextResponse.json(
      { error: "Embedded PayPal is not configured on this environment" },
      { status: 503 },
    );
  }

  const access = await getShopAccess();
  const adminUser = await getAdminUserFromRequest(request);
  if (!access.allowed && !adminUser) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: { draftId?: string; code?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const draftId = body.draftId?.trim();
  const code = body.code?.trim().toUpperCase();
  if (!draftId && !code) {
    return NextResponse.json({ error: "draftId or code is required" }, { status: 400 });
  }

  try {
    const draft = draftId
      ? await prisma.merchOrderDraft.findUnique({ where: { id: draftId } })
      : await prisma.merchOrderDraft.findUnique({ where: { code: code! } });

    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (draft.status === "paid") {
      return NextResponse.json({ error: "This order is already paid" }, { status: 409 });
    }
    if (draft.status === "cancelled" || draft.status === "expired") {
      return NextResponse.json({ error: "This draft is no longer valid" }, { status: 410 });
    }

    const isAdmin = Boolean(adminUser || access.admin);
    if (!isAdmin) {
      const email = (access.coach?.email ?? "").toLowerCase();
      const owns =
        (draft.createdByEmail && draft.createdByEmail.toLowerCase() === email) ||
        (draft.createdByUserId && draft.createdByUserId === access.coach?.id);
      if (!owns) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const order = await createPayPalOrder({
      draftCode: draft.code,
      description: draft.productName,
      sku: draft.productId,
      amountCents: draft.amountCents,
      quantity: draft.quantity,
      invoiceId: draft.code,
    });

    const updated = await attachPaypalOrderToDraft({
      draftId: draft.id,
      paypalOrderId: order.id,
    });

    return NextResponse.json({
      id: order.id,
      status: order.status,
      draft: updated,
    });
  } catch (err) {
    console.error("[merch/paypal/create-order]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create PayPal order" },
      { status: 502 },
    );
  }
}
