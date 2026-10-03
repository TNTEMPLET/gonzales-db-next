import { NextResponse } from "next/server";

import { ordersAdminApiDenial } from "@/lib/auth/ordersModule";
import {
  getPayPalBrowserClientId,
  getPayPalMode,
  isPayPalOrdersConfigured,
} from "@/lib/paypal/orders";

/** Public: whether embedded PayPal is available + browser client id. */
export async function GET() {
  const hidden = ordersAdminApiDenial();
  if (hidden) {
    return NextResponse.json({ error: hidden.message }, { status: hidden.status });
  }

  const clientId = getPayPalBrowserClientId();
  const configured = isPayPalOrdersConfigured() && Boolean(clientId);
  return NextResponse.json({
    configured,
    clientId: configured ? clientId : null,
    mode: getPayPalMode(),
    currency: "USD",
  });
}
