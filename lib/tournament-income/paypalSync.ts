import type { TournamentIncomeTransaction } from "@prisma/client";

import { fetchRecentPayPalTransactions, type PayPalTransaction } from "@/lib/paypal/client";
import prisma from "@/lib/prisma";
import type { BracketOrgId } from "@/lib/siteConfig";
import { classifyTournamentIncomeTransaction } from "@/lib/tournament-income/classifier";
import { seasonYearFromDate } from "@/lib/tournament-income/constants";

export type TournamentIncomeSyncOptions = {
  organizationId: BracketOrgId;
  seasonYear?: number;
  startDate?: Date;
  endDate?: Date;
  dryRun?: boolean;
};

export type TournamentIncomeSyncPreviewRow = {
  paypalTxId: string;
  paypalTxDate: string;
  payerName: string | null;
  itemName: string | null;
  grossAmountCents: number;
  category: string;
  classificationStatus: string;
  matchedKeywords: string[];
  action: "create" | "update" | "skip";
  reason: string;
};

export type TournamentIncomeSyncResult = {
  dryRun: boolean;
  fetched: number;
  considered: number;
  created: number;
  updated: number;
  skipped: number;
  unmatched: number;
  transactions: TournamentIncomeSyncPreviewRow[];
};

const COMPLETED_PAYPAL_STATUSES = new Set(["S", "P"]);

function daysBackForRange(startDate?: Date): number {
  if (!startDate || !Number.isFinite(startDate.getTime())) return 180;
  const diffMs = Date.now() - startDate.getTime();
  const days = Math.ceil(diffMs / 86_400_000) + 1;
  return Math.min(730, Math.max(1, days));
}

function isWithinRange(tx: PayPalTransaction, startDate?: Date, endDate?: Date): boolean {
  const time = tx.txDate.getTime();
  if (startDate && time < startDate.getTime()) return false;
  if (endDate && time > endDate.getTime()) return false;
  return true;
}

function previewRow(
  tx: PayPalTransaction,
  action: TournamentIncomeSyncPreviewRow["action"],
  classification: ReturnType<typeof classifyTournamentIncomeTransaction>,
): TournamentIncomeSyncPreviewRow {
  return {
    paypalTxId: tx.txId,
    paypalTxDate: tx.txDate.toISOString(),
    payerName: tx.payerName,
    itemName: tx.itemName,
    grossAmountCents: tx.amountCents,
    category: classification.category,
    classificationStatus: classification.classificationStatus,
    matchedKeywords: classification.matchedKeywords,
    action,
    reason: classification.reason,
  };
}

function dataFromPayPalTransaction(
  tx: PayPalTransaction,
  options: TournamentIncomeSyncOptions,
  classification: ReturnType<typeof classifyTournamentIncomeTransaction>,
) {
  const feeAmountCents = 0;
  const grossAmountCents = tx.amountCents;
  return {
    organizationId: options.organizationId,
    seasonYear: options.seasonYear ?? seasonYearFromDate(tx.txDate),
    category: classification.category,
    paypalTxId: tx.txId,
    paypalTxDate: tx.txDate,
    paypalStatus: tx.status || null,
    payerName: tx.payerName,
    payerEmail: tx.payerEmail,
    itemName: tx.itemName,
    paypalNote: tx.note,
    paypalMemo: tx.checkoutNote,
    grossAmountCents,
    feeAmountCents,
    netAmountCents: grossAmountCents - feeAmountCents,
    classificationStatus: classification.classificationStatus,
  };
}

export async function syncTournamentIncomeFromPayPal(
  options: TournamentIncomeSyncOptions,
): Promise<TournamentIncomeSyncResult> {
  const rawTransactions = await fetchRecentPayPalTransactions(daysBackForRange(options.startDate));
  const considered = rawTransactions.filter(
    (tx) =>
      tx.txId &&
      tx.amountCents > 0 &&
      COMPLETED_PAYPAL_STATUSES.has(tx.status) &&
      isWithinRange(tx, options.startDate, options.endDate),
  );

  let created = 0;
  let updated = 0;
  const skipped = 0;
  let unmatched = 0;
  const transactions: TournamentIncomeSyncPreviewRow[] = [];

  for (const tx of considered) {
    const classification = classifyTournamentIncomeTransaction(tx, {
      targetOrg: options.organizationId,
    });
    if (classification.classificationStatus === "UNMATCHED") unmatched += 1;

    const existing: TournamentIncomeTransaction | null = await prisma.tournamentIncomeTransaction.findUnique({
      where: {
        organizationId_paypalTxId: {
          organizationId: options.organizationId,
          paypalTxId: tx.txId,
        },
      },
    });
    const action = existing ? "update" : "create";
    transactions.push(previewRow(tx, action, classification));

    if (options.dryRun) continue;

    const data = dataFromPayPalTransaction(tx, options, classification);
    if (existing) {
      await prisma.tournamentIncomeTransaction.update({
        where: { id: existing.id },
        data: {
          seasonYear: data.seasonYear,
          paypalTxDate: data.paypalTxDate,
          paypalStatus: data.paypalStatus,
          payerName: data.payerName,
          payerEmail: data.payerEmail,
          itemName: data.itemName,
          paypalNote: data.paypalNote,
          paypalMemo: data.paypalMemo,
          grossAmountCents: data.grossAmountCents,
          feeAmountCents: data.feeAmountCents,
          netAmountCents: data.netAmountCents,
          ...(existing.classificationStatus === "MANUAL"
            ? {}
            : {
                category: data.category,
                classificationStatus: data.classificationStatus,
              }),
        },
      });
      updated += 1;
    } else {
      await prisma.tournamentIncomeTransaction.create({ data });
      created += 1;
    }
  }

  return {
    dryRun: Boolean(options.dryRun),
    fetched: rawTransactions.length,
    considered: considered.length,
    created,
    updated,
    skipped,
    unmatched,
    transactions,
  };
}
