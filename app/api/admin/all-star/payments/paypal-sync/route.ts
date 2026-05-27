import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
// import { syncPayPalTransactionsForCycle } from "@/lib/paypal/client"; // enable when ready

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as { cycleId?: string };
  if (!body.cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  // ── PayPal integration not yet activated ─────────────────────────────────
  // To enable:
  //   1. Create a PayPal app at https://developer.paypal.com/dashboard/applications
  //   2. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env.local
  //   3. Set PAYPAL_MODE=live (or sandbox for testing)
  //   4. Uncomment the import above and the call below
  //
  // const result = await syncPayPalTransactionsForCycle(body.cycleId);
  // return NextResponse.json({ success: true, ...result });

  return NextResponse.json(
    {
      error: "PayPal sync is not yet configured.",
      instructions:
        "Add PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and PAYPAL_MODE to .env.local, then enable the integration in this route.",
    },
    { status: 501 },
  );
}
