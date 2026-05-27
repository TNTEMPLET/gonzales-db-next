import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      organizationId: true,
      seasonYear: true,
      ageGroup: true,
      allStarAgeGroupLabel: true,
      title: true,
    },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const payments = await prisma.allStarPayment.findMany({
    where: { ballotCycleId: cycleId },
    orderBy: [{ isPaid: "asc" }, { team: "asc" }, { playerFullName: "asc" }],
  });

  // Build worksheet rows
  const rows = payments.map((p) => ({
    "Player Name": p.playerFullName,
    "Age Group": p.ageGroup,
    Team: p.team,
    "Payer Name": p.payerName ?? "",
    "Amount": `$${(p.amountCents / 100).toFixed(2)}`,
    Status: p.isPaid ? "PAID" : "UNPAID",
    "Paid Date": p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-US") : "",
    "PayPal TX ID": p.paypalTxId ?? "",
    "PayPal Date": p.paypalTxDate ? new Date(p.paypalTxDate).toLocaleDateString("en-US") : "",
    "PayPal Note": p.paypalNote ?? "",
    Notes: p.notes ?? "",
  }));

  // Summary rows appended at bottom
  const paidCount = payments.filter((p) => p.isPaid).length;
  const unpaidCount = payments.length - paidCount;
  const totalCollected = (paidCount * 9500) / 100;
  const totalOutstanding = (unpaidCount * 9500) / 100;

  const summaryRows = [
    {},
    { "Player Name": "SUMMARY", "Age Group": "", Team: "" },
    { "Player Name": "Total Players", "Age Group": String(payments.length) },
    { "Player Name": "Paid", "Age Group": String(paidCount) },
    { "Player Name": "Unpaid", "Age Group": String(unpaidCount) },
    { "Player Name": "Total Collected", "Age Group": `$${totalCollected.toFixed(2)}` },
    { "Player Name": "Total Outstanding", "Age Group": `$${totalOutstanding.toFixed(2)}` },
  ];

  const ws = XLSX.utils.json_to_sheet([...rows, ...summaryRows]);

  // Column widths
  ws["!cols"] = [
    { wch: 28 }, // Player Name
    { wch: 12 }, // Age Group
    { wch: 22 }, // Team
    { wch: 24 }, // Payer Name
    { wch: 10 }, // Amount
    { wch: 10 }, // Status
    { wch: 14 }, // Paid Date
    { wch: 20 }, // PayPal TX ID
    { wch: 14 }, // PayPal Date
    { wch: 32 }, // PayPal Note
    { wch: 32 }, // Notes
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = `${cycle.seasonYear} ${cycle.ageGroup} Payments`;
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel sheet name limit

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const cycleName = [
    cycle.seasonYear,
    cycle.allStarAgeGroupLabel || cycle.ageGroup,
    cycle.title,
  ]
    .filter(Boolean)
    .join("-")
    .replace(/\s+/g, "_");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="AllStar_Payments_${cycleName}.xlsx"`,
    },
  });
}
