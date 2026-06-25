import type { TournamentIncomeTransaction } from "@prisma/client";

import { TOURNAMENT_INCOME_CATEGORY_LABELS } from "@/lib/tournament-income/constants";

type CsvIncomeRow = TournamentIncomeTransaction;

function escapeCsv(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}

function fmtMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function tournamentIncomeCsvFilename(options: {
  organizationId: string;
  seasonYear?: number;
}): string {
  const date = new Date().toISOString().slice(0, 10);
  const season = options.seasonYear ? `_${options.seasonYear}` : "";
  return `TournamentIncome_${options.organizationId}${season}_${date}.csv`;
}

export function exportTournamentIncomeCsv(rows: CsvIncomeRow[]): string {
  const header = [
    "Date",
    "Org",
    "Season",
    "Category",
    "Classification",
    "PayPal Tx ID",
    "Status",
    "Payer Name",
    "Payer Email",
    "Item Name",
    "PayPal Note",
    "PayPal Memo",
    "Gross",
    "Fee",
    "Net",
    "Admin Notes",
  ];

  const body = rows.map((row) => [
    fmtDate(row.paypalTxDate),
    row.organizationId,
    row.seasonYear,
    TOURNAMENT_INCOME_CATEGORY_LABELS[row.category],
    row.classificationStatus,
    row.paypalTxId,
    row.paypalStatus,
    row.payerName,
    row.payerEmail,
    row.itemName,
    row.paypalNote,
    row.paypalMemo,
    fmtMoney(row.grossAmountCents),
    fmtMoney(row.feeAmountCents),
    fmtMoney(row.netAmountCents),
    row.adminNotes,
  ].map(escapeCsv).join(","));

  const totals = rows.reduce(
    (acc, row) => ({
      grossAmountCents: acc.grossAmountCents + row.grossAmountCents,
      feeAmountCents: acc.feeAmountCents + row.feeAmountCents,
      netAmountCents: acc.netAmountCents + row.netAmountCents,
    }),
    { grossAmountCents: 0, feeAmountCents: 0, netAmountCents: 0 },
  );
  const totalRow = [
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    fmtMoney(totals.grossAmountCents),
    fmtMoney(totals.feeAmountCents),
    fmtMoney(totals.netAmountCents),
    "",
  ].map(escapeCsv).join(",");

  return [header.map(escapeCsv).join(","), ...body, totalRow].join("\r\n");
}
