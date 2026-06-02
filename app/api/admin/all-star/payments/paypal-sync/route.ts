import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { fetchRecentPayPalTransactions } from "@/lib/paypal/client";
import { scoreNameMatch } from "@/lib/paypal/parseCsv";
import type {
  CsvMatchRow,
  CsvSkippedRow,
  CsvCandidate,
} from "@/app/api/admin/all-star/payments/paypal-csv/route";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  // Fetch all transactions once, paginated internally in 31-day windows
  const transactions = await fetchRecentPayPalTransactions(180);

  // Filter to All-Star participation fee transactions
  const allStarTx = transactions.filter((tx) => {
    if (!["S", "P"].includes(tx.status)) return false;
    const item = (tx.itemName ?? "").toLowerCase();
    return item.includes("all star") || item.includes("all-star");
  });

  const allPayments = await prisma.allStarPayment.findMany({
    select: {
      id: true,
      playerFullName: true,
      ageGroup: true,
      team: true,
      rosterTag: true,
      organizationId: true,
      isPaid: true,
      paypalTxId: true,
    },
  });

  const existingTxIds = new Set(
    allPayments.filter((p) => p.paypalTxId).map((p) => p.paypalTxId!),
  );

  const matchRows: CsvMatchRow[] = [];
  const skipped: CsvSkippedRow[] = [];

  for (const tx of allStarTx) {
    if (existingTxIds.has(tx.txId)) {
      skipped.push({
        txId: tx.txId,
        payerName: tx.payerName ?? "",
        grossCents: tx.amountCents,
        itemTitle: tx.itemName ?? "",
        playerNote: tx.payerName ?? "",
        reason: "already_synced",
      });
      continue;
    }

    if (!tx.payerName) {
      skipped.push({
        txId: tx.txId,
        payerName: "",
        grossCents: tx.amountCents,
        itemTitle: tx.itemName ?? "",
        playerNote: "",
        reason: "not_participation_fee",
      });
      continue;
    }

    // Score every payment by payer name — parents pay, so last-name match is the signal
    const candidates: CsvCandidate[] = allPayments
      .map((p) => ({
        paymentId: p.id,
        playerFullName: p.playerFullName,
        rosterTag: p.rosterTag,
        team: p.team,
        ageGroup: p.ageGroup,
        confidence: scoreNameMatch(tx.payerName!, p.playerFullName),
        isAlreadyPaid: p.isPaid,
        hasDifferentTx: !!p.paypalTxId && p.paypalTxId !== tx.txId,
      }))
      .filter((c) => c.confidence >= 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    matchRows.push({
      txId: tx.txId,
      txDate: tx.txDate.toISOString(),
      payerName: tx.payerName,
      grossCents: tx.amountCents,
      amountPerPlayerCents: tx.amountCents,
      quantity: 1,
      playerNote: tx.payerName,
      itemTitle: tx.itemName ?? "",
      orgId: null,
      candidates,
    });
  }

  return NextResponse.json({
    matchRows,
    skipped,
    totalTransactions: allStarTx.length,
    feeCents: 9500,
  });
}
