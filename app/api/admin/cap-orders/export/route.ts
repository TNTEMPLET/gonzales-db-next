import { NextRequest, NextResponse } from "next/server";
import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";

function escapeCsv(value: string | null | undefined): string {
  const s = value ?? "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(request.url);
  const orgFilter = url.searchParams.get("org") ?? "all";

  const where = orgFilter === "all" ? {} : { org: orgFilter };

  const records = await prisma.capOrderRecord.findMany({
    where,
    include: { items: { orderBy: { seq: "asc" } } },
    orderBy: { txDate: "asc" },
  });

  const header = ["Date", "Org", "Payer Name", "Email", "Hat Size / Note", "Qty", "Amount", "Fulfilled", "Remaining"].join(",");

  const rows = records.map((r) => {
    const fulfilledCount = r.items.filter((i) => i.status === "fulfilled").length;
    return [
      escapeCsv(fmtDate(r.txDate)),
      escapeCsv(r.org === "gonzales" ? "Gonzales DYB" : r.org === "ascension" ? "Ascension LLB" : r.org),
      escapeCsv(r.payerName),
      escapeCsv(r.payerEmail),
      escapeCsv(r.note),
      String(r.quantity),
      escapeCsv(fmtMoney(r.amountCents)),
      String(fulfilledCount),
      String(r.quantity - fulfilledCount),
    ].join(",");
  });

  const orgLabel = orgFilter === "gonzales" ? "Gonzales DYB" : orgFilter === "ascension" ? "Ascension LLB" : "All Orgs";
  const csvContent = [`# Parent Cap Orders – ${orgLabel}`, header, ...rows].join("\r\n");
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `CapOrders_${orgFilter === "all" ? "All" : orgFilter === "gonzales" ? "Gonzales" : "Ascension"}_${dateStr}.csv`;

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
