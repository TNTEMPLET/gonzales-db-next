/**
 * PayPal Transactions API client – stub.
 *
 * HOW TO ACTIVATE
 * ───────────────
 * 1. Go to https://developer.paypal.com/dashboard/applications/live
 * 2. Create a new app (or use an existing one).
 * 3. Copy the Client ID and Secret into .env.local:
 *
 *      PAYPAL_CLIENT_ID=<your-client-id>
 *      PAYPAL_CLIENT_SECRET=<your-client-secret>
 *      PAYPAL_MODE=live          # or "sandbox" for testing
 *
 * 4. In app/api/admin/all-star/payments/paypal-sync/route.ts, uncomment the
 *    import and the call to syncPayPalTransactionsForCycle().
 *
 * MATCHING LOGIC
 * ──────────────
 * The sync searches all PayPal transactions within the last 180 days for the
 * configured account. For each transaction it looks for a player name from the
 * payment tracker in the transaction's note/memo field (case-insensitive).
 * When a match is found the payment record is marked paid and the PayPal
 * metadata (txId, txDate, payerName, note) is stored.
 *
 * Transactions that don't match any player name are returned as `unmatched`
 * so the admin can manually assign them.
 */

const PAYPAL_API_BASE =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env.local to use the PayPal integration.",
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal token request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export type PayPalTransaction = {
  txId: string;
  txDate: Date;
  payerName: string | null;
  payerEmail: string | null;
  amountCents: number;
  note: string | null;
  status: string;
};

/**
 * Fetch PayPal transactions for the last `daysBack` days.
 * PayPal caps each request at 31 days, so we paginate through windows.
 * Returns raw transaction data — matching to players is done by the caller.
 */
export async function fetchRecentPayPalTransactions(
  daysBack = 180,
): Promise<PayPalTransaction[]> {
  const token = await getAccessToken();

  const MAX_WINDOW = 31;
  const allTransactions: PayPalTransaction[] = [];

  const overallEnd = new Date();
  const overallStart = new Date();
  overallStart.setDate(overallStart.getDate() - daysBack);

  let windowEnd = new Date(overallEnd);

  while (windowEnd > overallStart) {
    const windowStart = new Date(windowEnd);
    windowStart.setDate(windowStart.getDate() - MAX_WINDOW);
    if (windowStart < overallStart) windowStart.setTime(overallStart.getTime());

    const params = new URLSearchParams({
      start_date: windowStart.toISOString(),
      end_date: windowEnd.toISOString(),
      fields: "all",
      page_size: "500",
      page: "1",
    });

    const res = await fetch(
      `${PAYPAL_API_BASE}/v1/reporting/transactions?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      throw new Error(`PayPal transactions request failed: ${res.status} ${await res.text()}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as { transaction_details?: any[] };
    const details = data.transaction_details ?? [];

    for (const tx of details) {
      const info = tx.transaction_info ?? {};
      const payer = tx.payer_info ?? {};
      const amountStr: string = info.transaction_amount?.value ?? "0";
      const amountCents = Math.round(parseFloat(amountStr) * 100);
      allTransactions.push({
        txId: info.transaction_id ?? "",
        txDate: new Date(info.transaction_initiation_date ?? Date.now()),
        payerName:
          payer.payer_name
            ? `${payer.payer_name.given_name ?? ""} ${payer.payer_name.surname ?? ""}`.trim() || null
            : null,
        payerEmail: payer.email_address ?? null,
        amountCents,
        note: info.transaction_note ?? info.transaction_subject ?? null,
        status: info.transaction_status ?? "",
      });
    }

    windowEnd = new Date(windowStart);
    windowEnd.setMilliseconds(windowEnd.getMilliseconds() - 1);
  }

  return allTransactions;
}

/**
 * Sync PayPal transactions for a given ballot cycle.
 *
 * Matches transactions to payment records by looking for the player's full
 * name (or last name) in the PayPal note/memo field (case-insensitive).
 *
 * Returns counts of matched/unmatched transactions.
 *
 * NOTE: This function is not yet wired up. See the route file comments above.
 */
export async function syncPayPalTransactionsForCycle(
  cycleId: string,
): Promise<{
  matched: number;
  alreadyPaid: number;
  unmatched: PayPalTransaction[];
}> {
  // Lazy import to avoid pulling Prisma into edge environments.
  const { default: prisma } = await import("@/lib/prisma");

  const payments = await prisma.allStarPayment.findMany({
    where: { ballotCycleId: cycleId, isPaid: false },
  });

  const transactions = await fetchRecentPayPalTransactions(180);

  // Only consider completed/pending payments (not refunds etc.)
  const receivedTx = transactions.filter((tx) =>
    ["S", "P"].includes(tx.status), // S = Success, P = Pending
  );

  let matched = 0;
  let alreadyPaid = 0;
  const unmatchedTx: PayPalTransaction[] = [];

  for (const tx of receivedTx) {
    if (!tx.note) {
      unmatchedTx.push(tx);
      continue;
    }

    const noteNorm = tx.note.toLowerCase();
    const match = payments.find((p) => {
      const fullNorm = p.playerFullName.toLowerCase();
      const parts = fullNorm.split(/\s+/);
      // Match if note contains the full name or at least last name + one other part
      return (
        noteNorm.includes(fullNorm) ||
        (parts.length > 1 && noteNorm.includes(parts[parts.length - 1]))
      );
    });

    if (!match) {
      unmatchedTx.push(tx);
      continue;
    }

    if (match.isPaid) {
      alreadyPaid++;
      continue;
    }

    await prisma.allStarPayment.update({
      where: { id: match.id },
      data: {
        isPaid: true,
        paidAt: tx.txDate,
        paypalTxId: tx.txId,
        paypalTxDate: tx.txDate,
        payerName: tx.payerName,
        paypalNote: tx.note,
      },
    });
    matched++;
  }

  return { matched, alreadyPaid, unmatched: unmatchedTx };
}
