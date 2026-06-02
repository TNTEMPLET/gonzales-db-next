import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";
import {
  parsePaypalCsv,
  isAllStarParticipationFee,
  detectOrgFromItemTitle,
  scoreNameMatch,
} from "@/lib/paypal/parseCsv";

export type UnpaidPlayer = {
  id: string;
  playerFullName: string;
  ageGroup: string;
  team: string;
  rosterTag: string | null;
  organizationId: string;
};

export type CsvCandidate = {
  paymentId: string;
  playerFullName: string;
  rosterTag: string | null;
  team: string;
  ageGroup: string;
  confidence: number;
  isAlreadyPaid: boolean;
  hasDifferentTx: boolean;
};

export type CsvMatchRow = {
  txId: string;
  txDate: string;
  payerName: string;
  grossCents: number;
  amountPerPlayerCents: number;
  quantity: number;
  playerNote: string;
  itemTitle: string;
  orgId: string | null;
  candidates: CsvCandidate[];
};

export type CsvSkippedRow = {
  txId: string;
  payerName: string;
  grossCents: number;
  itemTitle: string;
  playerNote: string;
  reason: "not_participation_fee" | "already_synced" | "fee_mismatch";
};

// ─── GET: list all unpaid players for manual assignment ───────────────────────
export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const unpaidPlayers = await prisma.allStarPayment.findMany({
    where: { isPaid: false },
    select: {
      id: true,
      playerFullName: true,
      ageGroup: true,
      team: true,
      rosterTag: true,
      organizationId: true,
    },
    orderBy: [{ organizationId: "asc" }, { rosterTag: "asc" }, { playerFullName: "asc" }],
  });

  return NextResponse.json({ unpaidPlayers });
}

// ─── POST: parse CSV and return match preview ─────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a CSV file." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const feeCentsStr = formData.get("feeCents");
  const feeCents = feeCentsStr ? parseInt(feeCentsStr as string, 10) : 9500;

  const csvText = await (file as File).text();
  const rows = parsePaypalCsv(csvText);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No completed transactions found in CSV." }, { status: 400 });
  }

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

  const existingTxIdSet = new Set(
    allPayments.filter((p) => p.paypalTxId).map((p) => p.paypalTxId!),
  );

  const matchRows: CsvMatchRow[] = [];
  const skipped: CsvSkippedRow[] = [];
  const reservedPaymentIds = new Set<string>();

  for (const row of rows) {
    if (!isAllStarParticipationFee(row)) {
      skipped.push({ txId: row.txId, payerName: row.payerName, grossCents: row.grossCents, itemTitle: row.itemTitle, playerNote: row.playerNote, reason: "not_participation_fee" });
      continue;
    }

    if (existingTxIdSet.has(row.txId)) {
      skipped.push({ txId: row.txId, payerName: row.payerName, grossCents: row.grossCents, itemTitle: row.itemTitle, playerNote: row.playerNote, reason: "already_synced" });
      continue;
    }

    // Fee amount validation: gross must be an exact multiple of feeCents
    if (feeCents > 0 && row.grossCents % feeCents !== 0) {
      skipped.push({ txId: row.txId, payerName: row.payerName, grossCents: row.grossCents, itemTitle: row.itemTitle, playerNote: row.playerNote, reason: "fee_mismatch" });
      continue;
    }

    const playerCount = feeCents > 0 ? row.grossCents / feeCents : row.quantity;
    const amountPerPlayerCents = feeCents > 0 ? feeCents : Math.round(row.grossCents / row.quantity);
    const rowOrg = detectOrgFromItemTitle(row.itemTitle);

    const scored = allPayments
      .filter((p) => !rowOrg || p.organizationId === rowOrg)
      .map((p) => ({ ...p, confidence: scoreNameMatch(row.playerNote, p.playerFullName) }))
      .filter((p) => p.confidence >= 0.5)
      .sort((a, b) => b.confidence - a.confidence);

    const candidates = scored
      .filter((p) => !reservedPaymentIds.has(p.id))
      .slice(0, playerCount)
      .map((p) => ({
        paymentId: p.id,
        playerFullName: p.playerFullName,
        rosterTag: p.rosterTag,
        team: p.team,
        ageGroup: p.ageGroup,
        confidence: p.confidence,
        isAlreadyPaid: p.isPaid,
        hasDifferentTx: !!p.paypalTxId && p.paypalTxId !== row.txId,
      }));

    for (const c of candidates) {
      if (c.confidence >= 0.85 && !c.isAlreadyPaid) reservedPaymentIds.add(c.paymentId);
    }

    const [month, day, year] = row.date.split("/");
    const txDate = new Date(`${year}-${month}-${day}T${row.time}`);

    matchRows.push({
      txId: row.txId,
      txDate: isNaN(txDate.getTime()) ? new Date().toISOString() : txDate.toISOString(),
      payerName: row.payerName,
      grossCents: row.grossCents,
      amountPerPlayerCents,
      quantity: playerCount,
      playerNote: row.playerNote,
      itemTitle: row.itemTitle,
      orgId: rowOrg,
      candidates,
    });
  }

  return NextResponse.json({ totalCsvRows: rows.length, matchRows, skipped, feeCents });
}

// ─── PATCH: apply confirmed matches OR undo a prior import ────────────────────
export async function PATCH(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as
    | { intent?: "apply"; confirmations: Array<{ paymentId: string; txId: string; txDate: string; payerName: string; playerNote: string; amountCents: number }> }
    | { intent: "undo"; txIds: string[] };

  if ("intent" in body && body.intent === "undo") {
    if (!Array.isArray(body.txIds) || body.txIds.length === 0) {
      return NextResponse.json({ error: "txIds is required for undo" }, { status: 400 });
    }
    const result = await prisma.allStarPayment.updateMany({
      where: { paypalTxId: { in: body.txIds } },
      data: { isPaid: false, paidAt: null, paypalTxId: null, paypalTxDate: null, payerName: null, paypalNote: null },
    });
    return NextResponse.json({ success: true, undone: result.count });
  }

  if (!Array.isArray(body.confirmations) || body.confirmations.length === 0) {
    return NextResponse.json({ error: "confirmations is required" }, { status: 400 });
  }

  let applied = 0;
  let skipped = 0;
  const appliedTxIds: string[] = [];

  for (const conf of body.confirmations) {
    const rec = await prisma.allStarPayment.findUnique({ where: { id: conf.paymentId } });
    if (!rec || rec.isPaid) { skipped++; continue; }
    await prisma.allStarPayment.update({
      where: { id: conf.paymentId },
      data: {
        isPaid: true,
        paidAt: new Date(conf.txDate),
        paypalTxId: conf.txId,
        paypalTxDate: new Date(conf.txDate),
        payerName: conf.payerName || null,
        paypalNote: conf.playerNote || null,
        ...(conf.amountCents > 0 ? { amountCents: conf.amountCents } : {}),
      },
    });
    applied++;
    appliedTxIds.push(conf.txId);
  }

  return NextResponse.json({ success: true, applied, skipped, appliedTxIds });
}
