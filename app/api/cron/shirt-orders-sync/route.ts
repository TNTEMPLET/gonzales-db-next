import { NextRequest, NextResponse } from "next/server";

import { syncShirtOrdersFromReporting } from "@/lib/merch/shirtOrderIngest";
import { isPayPalOrdersConfigured } from "@/lib/paypal/orders";

/**
 * Periodic shirt-order pull from PayPal Reporting.
 * Safety net when NCP webhooks are delayed or missed.
 * Schedule: vercel.json → every 10 minutes.
 */
function cronAuthorized(request: NextRequest): boolean {
  const secret =
    process.env.SHIRT_ORDERS_CRON_SECRET ||
    process.env.CRON_SECRET ||
    process.env.TOURNAMENT_MONITOR_CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPayPalOrdersConfigured()) {
    return NextResponse.json(
      { error: "PayPal API not configured", skipped: true },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const days = Math.min(31, Math.max(1, parseInt(url.searchParams.get("days") ?? "14", 10)));

  try {
    const result = await syncShirtOrdersFromReporting(days);
    return NextResponse.json({
      ok: true,
      ...result,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("shirt-orders-sync cron failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 502 },
    );
  }
}
