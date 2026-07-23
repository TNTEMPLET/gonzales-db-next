import { NextRequest, NextResponse } from "next/server";

import { completeMerchDraftFromPayPalCapture } from "@/lib/merch/orderDrafts";
import { getShopAccess } from "@/lib/merch/shopAccess";
import { capturePayPalOrder, isPayPalOrdersConfigured } from "@/lib/paypal/orders";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";

/**
 * Capture an approved PayPal order and complete the merch draft → shirt order.
 * Body: { orderID }  (PayPal JS SDK onApprove payload)
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

  let body: { orderID?: string; orderId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderId = (body.orderID ?? body.orderId ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ error: "orderID is required" }, { status: 400 });
  }

  try {
    const capture = await capturePayPalOrder(orderId);

    if (capture.status !== "COMPLETED" && capture.status !== "APPROVED") {
      // Some captures return COMPLETED on the capture object while order is COMPLETED
      const okStatuses = new Set(["COMPLETED", "PENDING"]);
      if (!okStatuses.has(capture.status)) {
        // still try to complete if we have a capture id
        if (!capture.captureId) {
          return NextResponse.json(
            { error: `Unexpected PayPal status: ${capture.status}` },
            { status: 402 },
          );
        }
      }
    }

    const captureId = capture.captureId ?? capture.orderId;
    const result = await completeMerchDraftFromPayPalCapture({
      draftCode: capture.customId,
      paypalOrderId: capture.orderId,
      captureId,
      amountCents: capture.amountCents,
      payerName: capture.payerName,
      payerEmail: capture.payerEmail,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: "Payment captured but draft could not be completed",
          reason: result.reason,
          captureId,
          customId: capture.customId,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: capture.status,
      captureId,
      draft: result.draft,
      shirtOrderId: result.shirtOrderId,
      created: result.created,
    });
  } catch (err) {
    console.error("[merch/paypal/capture-order]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Capture failed" },
      { status: 502 },
    );
  }
}
