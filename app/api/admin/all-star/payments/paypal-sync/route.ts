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

function parseCheckoutPlayerName(checkoutNote: string): string | null {
  // Checkout notes look like "Beckham Suire/ 8u navy" or "Kole Templet \n12 majors navy"
  const clean = checkoutNote.replace(/\\n/g, "\n").trim();
  const first = clean.split(/[\n/]/, 1)[0]?.trim() ?? "";
  // Must look like a name (contains a space, not purely numeric/team info)
  return first.length >= 3 && /^[a-zA-Z]/.test(first) && /[a-zA-Z].*\s+.*[a-zA-Z]/.test(first) ? first : null;
}

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as { feeCents?: number };
  const feeCents = body.feeCents && body.feeCents > 0 ? body.feeCents : 9500;

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

    // Fee amount validation: gross must be an exact multiple of feeCents
    if (tx.amountCents % feeCents !== 0) {
      skipped.push({
        txId: tx.txId,
        payerName: tx.payerName,
        grossCents: tx.amountCents,
        itemTitle: tx.itemName ?? "",
        playerNote: tx.payerName,
        reason: "fee_mismatch",
      });
      continue;
    }

    const playerCount = tx.amountCents / feeCents;

    // Prefer checkout note player name for matching; fall back to payer last name
    const checkoutPlayerName = tx.checkoutNote
      ? parseCheckoutPlayerName(tx.checkoutNote)
      : null;
    const matchSignal = checkoutPlayerName ?? tx.payerName!;
    const playerNote = tx.checkoutNote
      ? tx.checkoutNote.replace(/\\n/g, " ").trim()
      : tx.payerName ?? "";

    const candidates: CsvCandidate[] = allPayments
      .map((p) => ({
        paymentId: p.id,
        playerFullName: p.playerFullName,
        rosterTag: p.rosterTag,
        team: p.team,
        ageGroup: p.ageGroup,
        confidence: scoreNameMatch(matchSignal, p.playerFullName),
        isAlreadyPaid: p.isPaid,
        hasDifferentTx: !!p.paypalTxId && p.paypalTxId !== tx.txId,
      }))
      .filter((c) => c.confidence >= 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, playerCount * 3);

    matchRows.push({
      txId: tx.txId,
      txDate: tx.txDate.toISOString(),
      payerName: tx.payerName,
      grossCents: tx.amountCents,
      amountPerPlayerCents: feeCents,
      quantity: playerCount,
      playerNote,
      itemTitle: tx.itemName ?? "",
      orgId: null,
      candidates,
    });
  }

  return NextResponse.json({
    matchRows,
    skipped,
    totalTransactions: allStarTx.length,
    feeCents,
  });
}
