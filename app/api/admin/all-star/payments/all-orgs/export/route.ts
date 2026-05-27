import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { CONTENT_ORGS, type ContentOrgId } from "@/lib/siteConfig";

const ORG_LABELS: Record<ContentOrgId, string> = {
  gonzales: "Gonzales Diamond Baseball",
  ascension: "Ascension Little League",
};

const ALL_STAR_FEE_CENTS = 9500;

export async function GET(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminUser.isMaster) return NextResponse.json({ error: "Forbidden — master admin only" }, { status: 403 });

  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : null;

  const cycles = await prisma.allStarBallotCycle.findMany({
    where: year ? { seasonYear: year } : undefined,
    orderBy: [{ organizationId: "asc" }, { seasonYear: "desc" }, { ageGroup: "asc" }],
    select: {
      id: true, organizationId: true, seasonYear: true, ageGroup: true,
      allStarAgeGroupLabel: true, title: true,
    },
  });

  const cycleIds = cycles.map((c) => c.id);
  const allPayments = cycleIds.length
    ? await prisma.allStarPayment.findMany({
        where: { ballotCycleId: { in: cycleIds } },
        orderBy: [{ team: "asc" }, { playerFullName: "asc" }],
      })
    : [];

  const paymentsByCycle = new Map<string, typeof allPayments>();
  for (const p of allPayments) {
    const list = paymentsByCycle.get(p.ballotCycleId) ?? [];
    list.push(p);
    paymentsByCycle.set(p.ballotCycleId, list);
  }

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ────────────────────────────────────────────────────────
  const summaryRows: Record<string, string>[] = [];
  for (const orgId of CONTENT_ORGS) {
    const orgCycles = cycles.filter((c) => c.organizationId === orgId);
    if (orgCycles.length === 0) continue;

    summaryRows.push({ League: ORG_LABELS[orgId], "Age Group / Cycle": "", Total: "", Paid: "", Unpaid: "", "$ Collected": "", "$ Outstanding": "" });

    let orgTotal = 0, orgPaid = 0;
    for (const cycle of orgCycles) {
      const payments = paymentsByCycle.get(cycle.id) ?? [];
      const paidCount = payments.filter((p) => p.isPaid).length;
      const unpaidCount = payments.length - paidCount;
      orgTotal += payments.length;
      orgPaid += paidCount;

      const cycleName = [cycle.allStarAgeGroupLabel || cycle.ageGroup, cycle.title]
        .filter(Boolean).join(" — ");
      summaryRows.push({
        League: "",
        "Age Group / Cycle": `  ${cycle.seasonYear} ${cycleName}`,
        Total: String(payments.length),
        Paid: String(paidCount),
        Unpaid: String(unpaidCount),
        "$ Collected": `$${((paidCount * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
        "$ Outstanding": `$${((unpaidCount * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
      });
    }

    const orgUnpaid = orgTotal - orgPaid;
    summaryRows.push({
      League: `  ${ORG_LABELS[orgId]} Total`,
      "Age Group / Cycle": "",
      Total: String(orgTotal),
      Paid: String(orgPaid),
      Unpaid: String(orgUnpaid),
      "$ Collected": `$${((orgPaid * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
      "$ Outstanding": `$${((orgUnpaid * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
    });
    summaryRows.push({ League: "", "Age Group / Cycle": "", Total: "", Paid: "", Unpaid: "", "$ Collected": "", "$ Outstanding": "" });
  }

  const grandPaid = allPayments.filter((p) => p.isPaid).length;
  const grandUnpaid = allPayments.length - grandPaid;
  summaryRows.push({
    League: "GRAND TOTAL",
    "Age Group / Cycle": "",
    Total: String(allPayments.length),
    Paid: String(grandPaid),
    Unpaid: String(grandUnpaid),
    "$ Collected": `$${((grandPaid * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
    "$ Outstanding": `$${((grandUnpaid * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
  });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 32 }, { wch: 36 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheets 2+: one per org ──────────────────────────────────────────────────
  for (const orgId of CONTENT_ORGS) {
    const orgCycles = cycles.filter((c) => c.organizationId === orgId);
    const rows: Record<string, string>[] = [];

    for (const cycle of orgCycles) {
      const payments = paymentsByCycle.get(cycle.id) ?? [];
      const cycleName = [cycle.seasonYear, cycle.allStarAgeGroupLabel || cycle.ageGroup, cycle.title]
        .filter(Boolean).join(" — ");

      if (payments.length === 0) continue;

      // Section header row
      rows.push({ Cycle: cycleName, "Player Name": "", "Age Group": "", Team: "", "Payer Name": "", Amount: "", Status: "", "Paid Date": "", "PayPal TX": "", Notes: "" });

      for (const p of payments) {
        rows.push({
          Cycle: "",
          "Player Name": p.playerFullName,
          "Age Group": p.ageGroup,
          Team: p.team,
          "Payer Name": p.payerName ?? "",
          Amount: `$${(p.amountCents / 100).toFixed(2)}`,
          Status: p.isPaid ? "PAID" : "UNPAID",
          "Paid Date": p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-US") : "",
          "PayPal TX": p.paypalTxId ?? "",
          Notes: p.notes ?? "",
        });
      }
      rows.push({ Cycle: "", "Player Name": "", "Age Group": "", Team: "", "Payer Name": "", Amount: "", Status: "", "Paid Date": "", "PayPal TX": "", Notes: "" });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 36 }, { wch: 28 }, { wch: 12 }, { wch: 22 },
      { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 32 },
    ];

    const sheetName = orgId === "gonzales" ? "Gonzales DYB" : "Ascension LL";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const suffix = year ? `_${year}` : "_AllYears";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="AllStar_Payments_AllLeagues${suffix}.xlsx"`,
    },
  });
}
